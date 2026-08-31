from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session, joinedload

from app.db import SessionLocal, utcnow
from app.excel_export import edge_matches
from app.http import ApiError, dump
from app.models import (
    FormRecord,
    InstanceStatus,
    Notification,
    NotificationCategory,
    TaskStatus,
    TaskType,
    User,
    UserStatus,
    WorkflowDefStatus,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowLog,
    WorkflowTask,
)
from app.ws import push_to_user


def _as_def(raw) -> dict:
    if not isinstance(raw, dict):
        return {"nodes": [], "edges": []}
    return {"nodes": raw.get("nodes") or [], "edges": raw.get("edges") or []}


async def _notify(db: Session, user_id: str, category: NotificationCategory, title: str, content: str, related_id: str | None = None):
    n = Notification(userId=user_id, category=category, title=title, content=content, relatedType="workflow", relatedId=related_id)
    db.add(n)
    db.flush()
    await push_to_user(user_id, {"type": "notification", "data": dump(n)})


def _users_by_role(db: Session, tenant_id: str, role_code: str) -> list[User]:
    return (
        db.query(User)
        .join(User.userRoles)
        .filter(User.tenantId == tenant_id, User.status == UserStatus.ACTIVE)
        .join(__import__("app.models", fromlist=["UserRole"]).UserRole.role)
        .filter(__import__("app.models", fromlist=["Role"]).Role.code == role_code)
        .all()
    )


def _instance_bundle(db: Session, instance_id: str) -> WorkflowInstance:
    return (
        db.query(WorkflowInstance)
        .options(joinedload(WorkflowInstance.tasks), joinedload(WorkflowInstance.logs), joinedload(WorkflowInstance.workflow))
        .filter(WorkflowInstance.id == instance_id)
        .one()
    )


async def start_workflow(db: Session, *, tenant_id: str, workflow_id: str, record_id: str, form_id: str, initiator_id: str) -> WorkflowInstance:
    workflow = (
        db.query(WorkflowDefinition)
        .filter(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.tenantId == tenant_id,
            WorkflowDefinition.status == WorkflowDefStatus.PUBLISHED,
        )
        .first()
    )
    if not workflow:
        raise ApiError(400, "未找到已发布的工作流")
    defn = _as_def(workflow.definitionJson)
    start = next((n for n in defn["nodes"] if n.get("type") == "start"), defn["nodes"][0] if defn["nodes"] else None)
    if not start:
        raise ApiError(400, "工作流缺少发起节点")
    instance = WorkflowInstance(
        workflowId=workflow.id,
        formId=form_id,
        recordId=record_id,
        initiatorId=initiator_id,
        status=InstanceStatus.IN_PROGRESS,
        currentNodeIds=[start["id"]],
    )
    db.add(instance)
    db.flush()
    db.add(WorkflowLog(instanceId=instance.id, nodeId=start["id"], nodeName=start.get("name"), operatorId=initiator_id, action="submit", comment="提交表单，流程启动"))
    db.flush()
    await _advance_from(db, instance.id, start["id"], tenant_id)
    db.commit()
    return _instance_bundle(db, instance.id)


def _record_data(db: Session, instance: WorkflowInstance) -> dict:
    if not instance.recordId:
        return {}
    rec = db.query(FormRecord).filter(FormRecord.id == instance.recordId).first()
    return rec.dataJson if rec and isinstance(rec.dataJson, dict) else {}


def _outgoing(defn: dict, from_node_id: str, data: dict) -> list[dict]:
    edges = [e for e in defn["edges"] if e.get("source") == from_node_id]
    conditional = [e for e in edges if str(e.get("condition") or "").strip()]
    plain = [e for e in edges if not str(e.get("condition") or "").strip()]
    hit = [e for e in conditional if edge_matches(e.get("condition"), data)]
    if hit:
        return hit
    return plain


async def _advance_from(db: Session, instance_id: str, from_node_id: str, tenant_id: str, depth: int = 0) -> None:
    from app.models import Role, UserRole

    if depth > 20:
        return

    instance = db.query(WorkflowInstance).options(joinedload(WorkflowInstance.workflow)).filter(WorkflowInstance.id == instance_id).one()
    defn = _as_def(instance.workflow.definitionJson)
    data = _record_data(db, instance)
    next_ids = [e["target"] for e in _outgoing(defn, from_node_id, data)]
    next_nodes = [n for n in defn["nodes"] if n.get("id") in next_ids]

    condition_nodes = [n for n in next_nodes if n.get("type") == "condition"]
    rest = [n for n in next_nodes if n.get("type") != "condition"]
    for cn in condition_nodes:
        db.add(WorkflowLog(instanceId=instance_id, nodeId=cn["id"], nodeName=cn.get("name"), action="condition", comment=f"条件分支已计算，数据={list(data.keys())}"))
        await _advance_from(db, instance_id, cn["id"], tenant_id, depth + 1)
        return

    if rest and all(n.get("type") == "end" for n in rest):
        instance.status = InstanceStatus.APPROVED
        instance.currentNodeIds = [n["id"] for n in rest]
        instance.endedAt = utcnow()
        if instance.recordId:
            rec = db.query(FormRecord).filter(FormRecord.id == instance.recordId).first()
            if rec:
                rec.status = "archived"
        db.add(WorkflowLog(instanceId=instance_id, action="finish", comment="流程结束（通过）"))
        await _notify(db, instance.initiatorId, NotificationCategory.DONE, "流程已通过", "您的申请已审批通过", instance_id)
        return

    current_ids = []
    for node in rest:
        if node.get("type") == "end":
            continue
        current_ids.append(node["id"])
        role = node.get("assigneeRole") or "manager"
        assignees = (
            db.query(User)
            .join(UserRole, UserRole.userId == User.id)
            .join(Role, Role.id == UserRole.roleId)
            .filter(User.tenantId == tenant_id, User.status == UserStatus.ACTIVE, Role.code == role)
            .all()
        )
        hours = node.get("timeoutHours")
        due_at = utcnow() + timedelta(hours=hours) if hours else None
        node_type = node.get("type")
        task_type = TaskType.CC if node_type == "cc" else TaskType.NOTIFY if node_type == "notify" else TaskType.APPROVE
        for user in assignees:
            task = WorkflowTask(
                instanceId=instance_id,
                nodeId=node["id"],
                nodeName=node.get("name") or node["id"],
                assigneeId=user.id,
                type=task_type,
                status=TaskStatus.PENDING,
                dueAt=due_at,
            )
            db.add(task)
            db.flush()
            category = NotificationCategory.CC if task_type == TaskType.CC else NotificationCategory.TODO
            await _notify(db, user.id, category, f"待处理：{task.nodeName}", f"{task.nodeName} 有新的流程任务", task.id)
        if not assignees and task_type != TaskType.APPROVE:
            db.add(WorkflowLog(instanceId=instance_id, nodeId=node["id"], nodeName=node.get("name"), action=node_type, comment="无抄送/通知对象，自动跳过"))
    instance.currentNodeIds = current_ids or next_ids


async def scan_timeouts() -> int:
    db = SessionLocal()
    count = 0
    try:
        now = utcnow()
        tasks = (
            db.query(WorkflowTask)
            .options(joinedload(WorkflowTask.instance))
            .filter(WorkflowTask.status == TaskStatus.PENDING, WorkflowTask.dueAt.is_not(None), WorkflowTask.dueAt < now)
            .all()
        )
        for task in tasks:
            task.status = TaskStatus.TIMEOUT
            task.actedAt = now
            db.add(WorkflowLog(instanceId=task.instanceId, nodeId=task.nodeId, nodeName=task.nodeName, action="timeout", comment="审批超时"))
            await _notify(db, task.assigneeId, NotificationCategory.SYSTEM, "待办已超时", f"{task.nodeName} 已超过时限", task.id)
            if task.instance:
                await _notify(db, task.instance.initiatorId, NotificationCategory.SYSTEM, "流程节点超时", f"{task.nodeName} 审批超时", task.instanceId)
            count += 1
        if count:
            db.commit()
        else:
            db.rollback()
    finally:
        db.close()
    return count


async def act_on_task(db: Session, *, tenant_id: str, user_id: str, task_id: str, action: str, comment: str | None) -> WorkflowInstance:
    task = (
        db.query(WorkflowTask)
        .options(joinedload(WorkflowTask.instance).joinedload(WorkflowInstance.workflow))
        .filter(WorkflowTask.id == task_id, WorkflowTask.assigneeId == user_id)
        .first()
    )
    if not task:
        raise ApiError(404, "任务不存在")
    if task.status != TaskStatus.PENDING:
        raise ApiError(400, "任务已处理")
    if task.instance.workflow.tenantId != tenant_id:
        raise ApiError(403, "无权限")

    if action == "reject":
        task.status = TaskStatus.REJECTED
        task.comment = comment
        task.actedAt = utcnow()
        db.query(WorkflowTask).filter(WorkflowTask.instanceId == task.instanceId, WorkflowTask.status == TaskStatus.PENDING).update({"status": TaskStatus.CANCELLED})
        task.instance.status = InstanceStatus.REJECTED
        task.instance.endedAt = utcnow()
        if task.instance.recordId:
            rec = db.query(FormRecord).filter(FormRecord.id == task.instance.recordId).first()
            if rec:
                rec.status = "rejected"
        db.add(WorkflowLog(instanceId=task.instanceId, nodeId=task.nodeId, nodeName=task.nodeName, operatorId=user_id, action="reject", comment=comment))
        await _notify(db, task.instance.initiatorId, NotificationCategory.SYSTEM, "流程已驳回", comment or "申请被驳回，请修改后重新提交", task.instanceId)
        db.commit()
        return _instance_bundle(db, task.instanceId)

    task.status = TaskStatus.APPROVED
    task.comment = comment
    task.actedAt = utcnow()
    db.add(WorkflowLog(instanceId=task.instanceId, nodeId=task.nodeId, nodeName=task.nodeName, operatorId=user_id, action="approve", comment=comment or "同意"))
    pending = (
        db.query(WorkflowTask)
        .filter(
            WorkflowTask.instanceId == task.instanceId,
            WorkflowTask.nodeId == task.nodeId,
            WorkflowTask.status == TaskStatus.PENDING,
            WorkflowTask.type == TaskType.APPROVE,
        )
        .count()
    )
    if pending == 0:
        await _advance_from(db, task.instanceId, task.nodeId, tenant_id)
    db.commit()
    return _instance_bundle(db, task.instanceId)


async def retry_rejected(db: Session, *, tenant_id: str, record_id: str, user_id: str, data_json: dict) -> WorkflowInstance:
    record = db.query(FormRecord).filter(FormRecord.id == record_id, FormRecord.tenantId == tenant_id, FormRecord.createdById == user_id).first()
    if not record:
        raise ApiError(404, "记录不存在")
    record.dataJson = data_json
    record.status = "submitted"
    last = db.query(WorkflowInstance).filter(WorkflowInstance.recordId == record.id).order_by(WorkflowInstance.startedAt.desc()).first()
    if not last:
        raise ApiError(400, "记录未关联流程")
    db.flush()
    return await start_workflow(
        db,
        tenant_id=tenant_id,
        workflow_id=last.workflowId,
        record_id=record.id,
        form_id=record.formId,
        initiator_id=user_id,
    )
