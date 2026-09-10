"""写入演示数据。用法：在 backend 目录执行  python -m app.seed

环境变量 SEED_IF_EMPTY=true 时：库里已有租户则跳过，避免云上重启把数据清空。
"""

import os

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import SessionLocal, engine
from app.models import (
    Base,
    Permission,
    Plugin,
    PluginType,
    Role,
    RolePermission,
    Tenant,
    User,
    UserRole,
    WorkflowTemplate,
)
from app.security import hash_password

LEAVE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "title": "姓名", "component": "Input"},
        "department": {"type": "string", "title": "部门", "component": "Select"},
        "leaveType": {"type": "string", "title": "请假类型", "component": "Select"},
        "duration": {"type": "number", "title": "请假时长", "component": "NumberInput"},
        "reason": {"type": "string", "title": "请假原因", "component": "Textarea"},
    },
    "required": ["name", "department", "leaveType", "duration", "reason"],
}

SIMPLE_FLOW = {
    "nodes": [
        {"id": "start", "type": "start", "name": "发起"},
        {"id": "approve", "type": "approve", "name": "部门经理审批", "assigneeRole": "manager", "timeoutHours": 24},
        {"id": "end", "type": "end", "name": "结束"},
    ],
    "edges": [{"source": "start", "target": "approve"}, {"source": "approve", "target": "end"}],
}

PERM_DEFS = [
    ("user:read", "查看用户", "user", "read"),
    ("user:write", "管理用户", "user", "write"),
    ("role:read", "查看角色", "role", "read"),
    ("role:write", "管理角色", "role", "write"),
    ("form:read", "查看表单", "form", "read"),
    ("form:write", "编辑表单", "form", "write"),
    ("workflow:read", "查看流程", "workflow", "read"),
    ("workflow:write", "编辑流程", "workflow", "write"),
    ("record:read", "查看数据", "record", "read"),
    ("record:write", "管理数据", "record", "write"),
    ("plugin:write", "管理插件", "plugin", "write"),
    ("job:read", "查看任务", "job", "read"),
    ("job:write", "提交任务", "job", "write"),
]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        empty_only = os.getenv("SEED_IF_EMPTY", "").lower() in ("1", "true", "yes")
        if empty_only and db.query(Tenant).first():
            print("Seed skipped: tenant already exists.")
            return
        if not empty_only:
            db.execute(
                text(
                    """
                    TRUNCATE TABLE
                      "AsyncJob", "Plugin", "Notification", "WorkflowLog", "WorkflowTask",
                      "WorkflowInstance", "FormRecord", "FormDraft", "WorkflowDefinition",
                      "WorkflowTemplate", "Form", "RolePermission", "UserRole", "Permission",
                      "Role", "User", "Tenant"
                    RESTART IDENTITY CASCADE
                    """
                )
            )
            db.commit()

        tenant = Tenant(name="FormWise Demo", slug="demo")
        db.add(tenant)
        db.flush()

        perms = [Permission(code=c, name=n, resource=r, action=a) for c, n, r, a in PERM_DEFS]
        db.add_all(perms)
        db.flush()
        by_code = {p.code: p for p in perms}

        admin_role = Role(tenantId=tenant.id, code="admin", name="企业管理员")
        manager_role = Role(tenantId=tenant.id, code="manager", name="部门经理")
        employee_role = Role(tenantId=tenant.id, code="employee", name="员工")
        db.add_all([admin_role, manager_role, employee_role])
        db.flush()

        for p in perms:
            db.add(RolePermission(roleId=admin_role.id, permissionId=p.id))
        for code in ("form:read", "workflow:read", "record:read", "record:write"):
            db.add(RolePermission(roleId=manager_role.id, permissionId=by_code[code].id))
        for code in ("form:read", "record:read", "record:write", "workflow:read"):
            db.add(RolePermission(roleId=employee_role.id, permissionId=by_code[code].id))

        pwd = hash_password("Admin123!")
        admin = User(tenantId=tenant.id, email="admin@formwise.local", passwordHash=pwd, name="系统管理员", department="行政部", position="管理员")
        manager = User(tenantId=tenant.id, email="manager@formwise.local", passwordHash=pwd, name="张经理", department="研发部", position="经理")
        employee = User(tenantId=tenant.id, email="employee@formwise.local", passwordHash=pwd, name="李员工", department="研发部", position="专员")
        db.add_all([admin, manager, employee])
        db.flush()
        db.add_all(
            [
                UserRole(userId=admin.id, roleId=admin_role.id),
                UserRole(userId=manager.id, roleId=manager_role.id),
                UserRole(userId=employee.id, roleId=employee_role.id),
            ]
        )

        for name, category in [("员工请假", "人事"), ("费用报销", "财务"), ("物资采购", "行政"), ("加班申请", "人事"), ("出差审批", "人事")]:
            db.add(
                WorkflowTemplate(
                    name=name,
                    category=category,
                    description=f"{name}内置模板",
                    isBuiltin=True,
                    definitionJson=SIMPLE_FLOW,
                    formSchemaJson=LEAVE_SCHEMA,
                )
            )

        plugins = [
            (PluginType.FORM_COMPONENT, "Input", "输入框"),
            (PluginType.FORM_COMPONENT, "Select", "下拉选择"),
            (PluginType.FORM_COMPONENT, "DatePicker", "日期选择"),
            (PluginType.FORM_COMPONENT, "Upload", "文件上传"),
            (PluginType.FORM_COMPONENT, "Textarea", "文本域"),
            (PluginType.FORM_COMPONENT, "NumberInput", "数字输入"),
            (PluginType.FORM_COMPONENT, "Radio", "单选"),
            (PluginType.FORM_COMPONENT, "Checkbox", "多选"),
            (PluginType.FORM_COMPONENT, "SubForm", "子表单"),
            (PluginType.WORKFLOW_NODE, "start", "发起节点"),
            (PluginType.WORKFLOW_NODE, "approve", "审批节点"),
            (PluginType.WORKFLOW_NODE, "cc", "抄送节点"),
            (PluginType.WORKFLOW_NODE, "notify", "通知节点"),
            (PluginType.WORKFLOW_NODE, "condition", "条件分支节点"),
            (PluginType.WORKFLOW_NODE, "end", "结束节点"),
        ]
        for t, code, name in plugins:
            db.add(Plugin(type=t, code=code, name=name, configJson={}))

        db.commit()
        print("Seed completed.")
        print("Admin login: admin@formwise.local / Admin123!")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
