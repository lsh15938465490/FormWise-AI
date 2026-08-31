from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db, utcnow
from app.deps import AuthUser, get_current_user, require_permission
from app.http import ApiError, dump, ok, paginated
from app.models import Form, FormStatus, TaskStatus, WorkflowDefStatus, WorkflowDefinition, WorkflowInstance, WorkflowLog, WorkflowTask, WorkflowTemplate
from app.workflow_engine import act_on_task

router = APIRouter(prefix="/api/workflows", tags=["workflows"])
task_router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class FlowNode(BaseModel):
    id: str
    type: str
    name: str
    assigneeRole: str | None = None
    timeoutHours: float | None = None
    rejectRule: str | None = None
    x: float | None = None
    y: float | None = None


class FlowEdge(BaseModel):
    source: str
    target: str
    condition: str | None = None


class Definition(BaseModel):
    nodes: list[FlowNode]
    edges: list[FlowEdge]


class SaveTemplate(BaseModel):
    name: str = Field(min_length=1)
    category: str = "自定义"
    description: str | None = None
    definitionJson: Definition
    formSchemaJson: dict = Field(default_factory=lambda: {"type": "object", "properties": {}, "required": []})


class CreateWorkflow(BaseModel):
    name: str = Field(min_length=1)
    formId: str | None = None
    definitionJson: Definition


class PatchWorkflow(BaseModel):
    name: str | None = None
    formId: str | None = None
    definitionJson: Definition | None = None


class CommentBody(BaseModel):
    comment: str | None = None


def _dump_instance(inst: WorkflowInstance) -> dict:
    logs = sorted(inst.logs, key=lambda x: x.createdAt)
    return dump(inst, extra={"workflow": dump(inst.workflow), "tasks": dump(inst.tasks), "logs": dump(logs)})


@router.get("/templates")
def list_templates(db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    items = (
        db.query(WorkflowTemplate)
        .filter(or_(WorkflowTemplate.tenantId.is_(None), WorkflowTemplate.tenantId == auth.tenantId))
        .order_by(WorkflowTemplate.createdAt.asc())
        .all()
    )
    return ok(items)


@router.post("/templates", status_code=201)
def save_template(body: SaveTemplate, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:write"))):
    tpl = WorkflowTemplate(
        tenantId=auth.tenantId,
        name=body.name,
        category=body.category,
        description=body.description,
        definitionJson=body.definitionJson.model_dump(),
        formSchemaJson=body.formSchemaJson,
        isBuiltin=False,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return ok(tpl)


@router.post("/templates/{template_id}/apply", status_code=201)
def apply_template(template_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:write"))):
    tpl = db.query(WorkflowTemplate).filter(WorkflowTemplate.id == template_id).first()
    if not tpl:
        raise ApiError(404, "模板不存在")
    form = Form(
        tenantId=auth.tenantId,
        name=tpl.name,
        description=tpl.description,
        schemaJson=tpl.formSchemaJson,
        dataModelJson={"fields": []},
        linkageJson={"rules": []},
        layoutJson={"groups": []},
        createdById=auth.id,
        status=FormStatus.PUBLISHED,
        publishedAt=utcnow(),
    )
    db.add(form)
    db.flush()
    wf = WorkflowDefinition(
        tenantId=auth.tenantId,
        formId=form.id,
        name=f"{tpl.name}流程",
        definitionJson=tpl.definitionJson,
        createdById=auth.id,
        status=WorkflowDefStatus.PUBLISHED,
        publishedAt=utcnow(),
    )
    db.add(wf)
    db.commit()
    db.refresh(form)
    db.refresh(wf)
    return ok({"form": dump(form), "workflow": dump(wf)})


@router.get("")
def list_workflows(page: int = 1, pageSize: int = 20, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:read"))):
    page = max(1, page)
    page_size = min(100, max(1, pageSize))
    q = db.query(WorkflowDefinition).filter(WorkflowDefinition.tenantId == auth.tenantId)
    total = q.count()
    items = q.order_by(WorkflowDefinition.updatedAt.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return paginated(items, total, page, page_size)


@router.post("", status_code=201)
def create_workflow(body: CreateWorkflow, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:write"))):
    wf = WorkflowDefinition(
        tenantId=auth.tenantId,
        formId=body.formId,
        name=body.name,
        definitionJson=body.definitionJson.model_dump(),
        createdById=auth.id,
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return ok(wf)


@router.get("/instances")
def list_instances(db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:read"))):
    items = (
        db.query(WorkflowInstance)
        .join(WorkflowDefinition)
        .options(joinedload(WorkflowInstance.workflow), joinedload(WorkflowInstance.tasks), joinedload(WorkflowInstance.logs))
        .filter(WorkflowDefinition.tenantId == auth.tenantId)
        .order_by(WorkflowInstance.startedAt.desc())
        .limit(50)
        .all()
    )
    return ok([_dump_instance(i) for i in items])


@router.get("/instances/{instance_id}")
def get_instance(instance_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:read"))):
    inst = (
        db.query(WorkflowInstance)
        .join(WorkflowDefinition)
        .options(joinedload(WorkflowInstance.workflow), joinedload(WorkflowInstance.tasks), joinedload(WorkflowInstance.logs))
        .filter(WorkflowInstance.id == instance_id, WorkflowDefinition.tenantId == auth.tenantId)
        .first()
    )
    if not inst:
        raise ApiError(404, "流程实例不存在")
    return ok(_dump_instance(inst))


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:read"))):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id, WorkflowDefinition.tenantId == auth.tenantId).first()
    if not wf:
        raise ApiError(404, "工作流不存在")
    return ok(wf)


@router.patch("/{workflow_id}")
def patch_workflow(workflow_id: str, body: PatchWorkflow, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:write"))):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id, WorkflowDefinition.tenantId == auth.tenantId).first()
    if not wf:
        raise ApiError(404, "工作流不存在")
    data = body.model_dump(exclude_unset=True)
    if "definitionJson" in data and data["definitionJson"] is not None:
        data["definitionJson"] = body.definitionJson.model_dump() if body.definitionJson else None
    for k, v in data.items():
        setattr(wf, k, v)
    db.commit()
    db.refresh(wf)
    return ok(wf)


@router.post("/{workflow_id}/publish")
def publish_workflow(workflow_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("workflow:write"))):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id, WorkflowDefinition.tenantId == auth.tenantId).first()
    if not wf:
        raise ApiError(404, "工作流不存在")
    wf.status = WorkflowDefStatus.PUBLISHED
    wf.publishedAt = utcnow()
    db.commit()
    db.refresh(wf)
    return ok(wf)


def _dump_task(t: WorkflowTask) -> dict:
    inst = dump(t.instance, extra={"workflow": dump(t.instance.workflow)}) if t.instance else None
    return dump(t, extra={"instance": inst})


@task_router.get("/todo")
def todo(db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    items = (
        db.query(WorkflowTask)
        .options(joinedload(WorkflowTask.instance).joinedload(WorkflowInstance.workflow))
        .filter(WorkflowTask.assigneeId == auth.id, WorkflowTask.status == TaskStatus.PENDING)
        .order_by(WorkflowTask.createdAt.desc())
        .all()
    )
    return ok([_dump_task(t) for t in items])


@task_router.get("/done")
def done(db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    items = (
        db.query(WorkflowTask)
        .options(joinedload(WorkflowTask.instance).joinedload(WorkflowInstance.workflow))
        .filter(WorkflowTask.assigneeId == auth.id, WorkflowTask.status.in_([TaskStatus.APPROVED, TaskStatus.REJECTED]))
        .order_by(WorkflowTask.actedAt.desc())
        .limit(50)
        .all()
    )
    return ok([_dump_task(t) for t in items])


@task_router.post("/{task_id}/approve")
async def approve(task_id: str, body: CommentBody | None = None, db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    comment = body.comment if body else None
    result = await act_on_task(db, tenant_id=auth.tenantId, user_id=auth.id, task_id=task_id, action="approve", comment=comment)
    return ok(_dump_instance(result))


@task_router.post("/{task_id}/reject")
async def reject(task_id: str, body: CommentBody | None = None, db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    comment = body.comment if body else None
    result = await act_on_task(db, tenant_id=auth.tenantId, user_id=auth.id, task_id=task_id, action="reject", comment=comment)
    return ok(_dump_instance(result))
