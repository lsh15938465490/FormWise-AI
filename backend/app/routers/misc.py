from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import AuthUser, get_current_user, require_permission
from app.http import ApiError, ok
from app.models import AsyncJob, JobStatus, Plugin, PluginType

plugin_router = APIRouter(prefix="/api/plugins", tags=["plugins"])
job_router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class CreatePlugin(BaseModel):
    type: PluginType
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    configJson: dict = Field(default_factory=dict)
    enabled: bool = True


class PatchPlugin(BaseModel):
    name: str | None = None
    configJson: dict | None = None
    enabled: bool | None = None


class CreateJob(BaseModel):
    type: str = Field(min_length=1)
    payloadJson: dict = Field(default_factory=dict)


@plugin_router.get("")
def list_plugins(db: Session = Depends(get_db), _: AuthUser = Depends(get_current_user)):
    return ok(db.query(Plugin).order_by(Plugin.type.asc()).all())


@plugin_router.post("", status_code=201)
def create_plugin(body: CreatePlugin, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("plugin:write"))):
    p = Plugin(**body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return ok(p)


@plugin_router.patch("/{plugin_id}")
def patch_plugin(plugin_id: str, body: PatchPlugin, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("plugin:write"))):
    p = db.query(Plugin).filter(Plugin.id == plugin_id).first()
    if not p:
        raise ApiError(404, "插件不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return ok(p)


@job_router.get("")
def list_jobs(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("job:read"))):
    return ok(db.query(AsyncJob).order_by(AsyncJob.createdAt.desc()).limit(50).all())


@job_router.post("", status_code=201)
def create_job(body: CreateJob, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("job:write"))):
    job = AsyncJob(type=body.type, payloadJson=body.payloadJson, status=JobStatus.QUEUED)
    db.add(job)
    db.commit()
    db.refresh(job)
    return ok(job)
