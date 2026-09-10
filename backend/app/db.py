from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


engine = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


PG_ENUMS: dict[str, tuple[str, ...]] = {
    "UserStatus": ("ACTIVE", "DISABLED"),
    "FormStatus": ("DRAFT", "PUBLISHED", "ARCHIVED"),
    "WorkflowDefStatus": ("DRAFT", "PUBLISHED", "ARCHIVED"),
    "InstanceStatus": ("PENDING", "IN_PROGRESS", "APPROVED", "REJECTED", "TIMEOUT", "TERMINATED"),
    "TaskType": ("APPROVE", "CC", "NOTIFY"),
    "TaskStatus": ("PENDING", "IN_PROGRESS", "APPROVED", "REJECTED", "CANCELLED", "TIMEOUT"),
    "NotificationCategory": ("TODO", "DONE", "CC", "SYSTEM"),
    "PluginType": ("FORM_COMPONENT", "WORKFLOW_NODE"),
    "JobStatus": ("QUEUED", "RUNNING", "SUCCESS", "FAILED"),
}


def ensure_pg_enums() -> None:
    """空库没有 Prisma 预置枚举时，create_all 会失败，这里按需 CREATE TYPE。"""
    with engine.begin() as conn:
        for name, values in PG_ENUMS.items():
            quoted = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
            conn.execute(
                text(
                    f"""
                    DO $$ BEGIN
                        CREATE TYPE "{name}" AS ENUM ({quoted});
                    EXCEPTION
                        WHEN duplicate_object THEN NULL;
                    END $$;
                    """
                )
            )


def ensure_schema() -> None:
    ensure_pg_enums()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                DO $$ BEGIN
                    ALTER TABLE "Form" ADD COLUMN IF NOT EXISTS "visibleRoleCodes" jsonb DEFAULT '[]'::jsonb;
                EXCEPTION
                    WHEN undefined_table THEN NULL;
                END $$;
                """
            )
        )


def init_db() -> None:
    ensure_pg_enums()
    from app.models import Base

    Base.metadata.create_all(bind=engine)
    ensure_schema()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
