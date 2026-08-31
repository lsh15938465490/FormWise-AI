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


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "Form" ADD COLUMN IF NOT EXISTS "visibleRoleCodes" jsonb DEFAULT \'[]\'::jsonb'))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
