from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, new_id, utcnow


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


class FormStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class WorkflowDefStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


class InstanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    TIMEOUT = "TIMEOUT"
    TERMINATED = "TERMINATED"


class TaskType(str, enum.Enum):
    APPROVE = "APPROVE"
    CC = "CC"
    NOTIFY = "NOTIFY"


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"


class NotificationCategory(str, enum.Enum):
    TODO = "TODO"
    DONE = "DONE"
    CC = "CC"
    SYSTEM = "SYSTEM"


class PluginType(str, enum.Enum):
    FORM_COMPONENT = "FORM_COMPONENT"
    WORKFLOW_NODE = "WORKFLOW_NODE"


class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


def pg_enum(enum_cls: type[enum.Enum]):
    # 与 Prisma 已创建的 PostgreSQL 枚举同名；库已存在时不要重复 CREATE TYPE
    return Enum(
        enum_cls,
        name=enum_cls.__name__,
        native_enum=True,
        create_type=False,
        values_callable=lambda x: [e.value for e in x],
    )


class Tenant(Base):
    __tablename__ = "Tenant"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    users: Mapped[list[User]] = relationship(back_populates="tenant")
    roles: Mapped[list[Role]] = relationship(back_populates="tenant")


class User(Base):
    __tablename__ = "User"
    __table_args__ = (UniqueConstraint("tenantId", "email"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    passwordHash: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[UserStatus] = mapped_column(pg_enum(UserStatus), default=UserStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    tenant: Mapped[Tenant] = relationship(back_populates="users")
    userRoles: Mapped[list[UserRole]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notifications: Mapped[list[Notification]] = relationship(back_populates="user")


class Role(Base):
    __tablename__ = "Role"
    __table_args__ = (UniqueConstraint("tenantId", "code"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id"), nullable=False)
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    tenant: Mapped[Tenant] = relationship(back_populates="roles")
    userRoles: Mapped[list[UserRole]] = relationship(back_populates="role", cascade="all, delete-orphan")
    permissions: Mapped[list[RolePermission]] = relationship(back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    __tablename__ = "Permission"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    resource: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class UserRole(Base):
    __tablename__ = "UserRole"
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), primary_key=True)
    roleId: Mapped[str] = mapped_column(ForeignKey("Role.id", ondelete="CASCADE"), primary_key=True)
    assignedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    user: Mapped[User] = relationship(back_populates="userRoles")
    role: Mapped[Role] = relationship(back_populates="userRoles")


class RolePermission(Base):
    __tablename__ = "RolePermission"
    roleId: Mapped[str] = mapped_column(ForeignKey("Role.id", ondelete="CASCADE"), primary_key=True)
    permissionId: Mapped[str] = mapped_column(ForeignKey("Permission.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship()


class Form(Base):
    __tablename__ = "Form"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[FormStatus] = mapped_column(pg_enum(FormStatus), default=FormStatus.DRAFT)
    schemaJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    dataModelJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    linkageJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    layoutJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    visibleRoleCodes: Mapped[list] = mapped_column(JSONB, default=list)
    createdById: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    publishedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    drafts: Mapped[list[FormDraft]] = relationship(back_populates="form", cascade="all, delete-orphan")
    records: Mapped[list[FormRecord]] = relationship(back_populates="form")


class FormDraft(Base):
    __tablename__ = "FormDraft"
    __table_args__ = (UniqueConstraint("formId", "userId"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    formId: Mapped[str] = mapped_column(ForeignKey("Form.id", ondelete="CASCADE"), nullable=False)
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), nullable=False)
    contentJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    form: Mapped[Form] = relationship(back_populates="drafts")


class WorkflowTemplate(Base):
    __tablename__ = "WorkflowTemplate"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str | None] = mapped_column(ForeignKey("Tenant.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    definitionJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    formSchemaJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    isBuiltin: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class WorkflowDefinition(Base):
    __tablename__ = "WorkflowDefinition"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id"), nullable=False, index=True)
    formId: Mapped[str | None] = mapped_column(ForeignKey("Form.id"), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[WorkflowDefStatus] = mapped_column(pg_enum(WorkflowDefStatus), default=WorkflowDefStatus.DRAFT)
    definitionJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    createdById: Mapped[str] = mapped_column(String, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    publishedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    instances: Mapped[list[WorkflowInstance]] = relationship(back_populates="workflow")


class FormRecord(Base):
    __tablename__ = "FormRecord"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenantId: Mapped[str] = mapped_column(ForeignKey("Tenant.id"), nullable=False, index=True)
    formId: Mapped[str] = mapped_column(ForeignKey("Form.id"), nullable=False, index=True)
    dataJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String, default="submitted")
    createdById: Mapped[str] = mapped_column(ForeignKey("User.id"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    form: Mapped[Form] = relationship(back_populates="records")
    creator: Mapped[User] = relationship()
    instances: Mapped[list[WorkflowInstance]] = relationship(back_populates="record")


class WorkflowInstance(Base):
    __tablename__ = "WorkflowInstance"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    workflowId: Mapped[str] = mapped_column(ForeignKey("WorkflowDefinition.id"), nullable=False)
    formId: Mapped[str | None] = mapped_column(String, nullable=True)
    recordId: Mapped[str | None] = mapped_column(ForeignKey("FormRecord.id"), nullable=True)
    initiatorId: Mapped[str] = mapped_column(ForeignKey("User.id"), nullable=False, index=True)
    status: Mapped[InstanceStatus] = mapped_column(pg_enum(InstanceStatus), default=InstanceStatus.PENDING, index=True)
    currentNodeIds: Mapped[list] = mapped_column(JSONB, nullable=False)
    startedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    endedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    workflow: Mapped[WorkflowDefinition] = relationship(back_populates="instances")
    record: Mapped[FormRecord | None] = relationship(back_populates="instances")
    tasks: Mapped[list[WorkflowTask]] = relationship(back_populates="instance", cascade="all, delete-orphan")
    logs: Mapped[list[WorkflowLog]] = relationship(back_populates="instance", cascade="all, delete-orphan")


class WorkflowTask(Base):
    __tablename__ = "WorkflowTask"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    instanceId: Mapped[str] = mapped_column(ForeignKey("WorkflowInstance.id", ondelete="CASCADE"), nullable=False, index=True)
    nodeId: Mapped[str] = mapped_column(String, nullable=False)
    nodeName: Mapped[str] = mapped_column(String, nullable=False)
    assigneeId: Mapped[str] = mapped_column(ForeignKey("User.id"), nullable=False, index=True)
    type: Mapped[TaskType] = mapped_column(pg_enum(TaskType), default=TaskType.APPROVE)
    status: Mapped[TaskStatus] = mapped_column(pg_enum(TaskStatus), default=TaskStatus.PENDING)
    comment: Mapped[str | None] = mapped_column(String, nullable=True)
    dueAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    instance: Mapped[WorkflowInstance] = relationship(back_populates="tasks")
    assignee: Mapped[User] = relationship()


class WorkflowLog(Base):
    __tablename__ = "WorkflowLog"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    instanceId: Mapped[str] = mapped_column(ForeignKey("WorkflowInstance.id", ondelete="CASCADE"), nullable=False, index=True)
    nodeId: Mapped[str | None] = mapped_column(String, nullable=True)
    nodeName: Mapped[str | None] = mapped_column(String, nullable=True)
    operatorId: Mapped[str | None] = mapped_column(ForeignKey("User.id"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    comment: Mapped[str | None] = mapped_column(String, nullable=True)
    snapshotJson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    instance: Mapped[WorkflowInstance] = relationship(back_populates="logs")


class Notification(Base):
    __tablename__ = "Notification"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(ForeignKey("User.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[NotificationCategory] = mapped_column(pg_enum(NotificationCategory), default=NotificationCategory.SYSTEM)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    relatedType: Mapped[str | None] = mapped_column(String, nullable=True)
    relatedId: Mapped[str | None] = mapped_column(String, nullable=True)
    isRead: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    user: Mapped[User] = relationship(back_populates="notifications")


class Plugin(Base):
    __tablename__ = "Plugin"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    type: Mapped[PluginType] = mapped_column(pg_enum(PluginType), nullable=False)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    configJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AsyncJob(Base):
    __tablename__ = "AsyncJob"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[JobStatus] = mapped_column(pg_enum(JobStatus), default=JobStatus.QUEUED)
    payloadJson: Mapped[dict] = mapped_column(JSONB, nullable=False)
    resultJson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
