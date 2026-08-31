from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai_parser import parse_prompt_to_form, refine_form
from app.db import get_db, utcnow
from app.deps import AuthUser, require_permission
from app.http import ApiError, dump, ok, paginated
from app.models import Form, FormDraft, FormStatus

router = APIRouter(prefix="/api/forms", tags=["forms"])


class AiBody(BaseModel):
    prompt: str = Field(min_length=4)
    formId: str | None = None


class CreateForm(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    schemaJson: dict = Field(default_factory=lambda: {"type": "object", "properties": {}, "required": []})
    dataModelJson: dict = Field(default_factory=lambda: {"fields": []})
    linkageJson: dict = Field(default_factory=lambda: {"rules": []})
    layoutJson: dict = Field(default_factory=lambda: {"groups": []})
    visibleRoleCodes: list[str] = Field(default_factory=list)


class PatchForm(BaseModel):
    name: str | None = None
    description: str | None = None
    schemaJson: dict | None = None
    dataModelJson: dict | None = None
    linkageJson: dict | None = None
    layoutJson: dict | None = None
    visibleRoleCodes: list[str] | None = None


class DraftBody(BaseModel):
    contentJson: dict


def _can_see_form(form: Form, auth: AuthUser) -> bool:
    if "admin" in auth.roles:
        return True
    codes = form.visibleRoleCodes or []
    if not codes:
        return True
    return any(c in auth.roles for c in codes)


@router.post("/ai-generate", status_code=201)
def ai_generate(body: AiBody, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:write"))):
    current = None
    form = None
    if body.formId:
        form = db.query(Form).filter(Form.id == body.formId, Form.tenantId == auth.tenantId).first()
        if not form:
            raise ApiError(404, "表单不存在")
        current = {
            "name": form.name,
            "schemaJson": form.schemaJson,
            "layoutJson": form.layoutJson,
            "linkageJson": form.linkageJson,
        }
        generated = refine_form(current, body.prompt)
        form.name = generated["name"]
        form.description = generated["description"]
        form.schemaJson = generated["schemaJson"]
        form.dataModelJson = generated["dataModelJson"]
        form.linkageJson = generated["linkageJson"]
        form.layoutJson = generated["layoutJson"]
        db.commit()
        db.refresh(form)
        return ok({"form": dump(form), "generated": generated})
    generated = parse_prompt_to_form(body.prompt)
    form = Form(
        tenantId=auth.tenantId,
        name=generated["name"],
        description=generated["description"],
        schemaJson=generated["schemaJson"],
        dataModelJson=generated["dataModelJson"],
        linkageJson=generated["linkageJson"],
        layoutJson=generated["layoutJson"],
        createdById=auth.id,
        visibleRoleCodes=[],
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return ok({"form": dump(form), "generated": generated})


@router.get("")
def list_forms(page: int = 1, pageSize: int = 20, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:read"))):
    page = max(1, page)
    page_size = min(100, max(1, pageSize))
    q = db.query(Form).filter(Form.tenantId == auth.tenantId)
    if not auth.can("form:write"):
        q = q.filter(Form.status == FormStatus.PUBLISHED)
    rows = q.order_by(Form.updatedAt.desc()).all()
    visible = [f for f in rows if _can_see_form(f, auth)]
    total = len(visible)
    items = visible[(page - 1) * page_size : (page - 1) * page_size + page_size]
    return paginated(items, total, page, page_size)


@router.post("", status_code=201)
def create_form(body: CreateForm, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:write"))):
    form = Form(tenantId=auth.tenantId, createdById=auth.id, **body.model_dump())
    db.add(form)
    db.commit()
    db.refresh(form)
    return ok(form)


@router.get("/{form_id}")
def get_form(form_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:read"))):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    if not _can_see_form(form, auth):
        raise ApiError(403, "无权限查看该表单")
    drafts = db.query(FormDraft).filter(FormDraft.formId == form.id, FormDraft.userId == auth.id).all()
    return ok(dump(form, extra={"drafts": dump(drafts)}))


@router.patch("/{form_id}")
def patch_form(form_id: str, body: PatchForm, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:write"))):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(form, k, v)
    db.commit()
    db.refresh(form)
    return ok(form)


@router.post("/{form_id}/publish")
def publish_form(form_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:write"))):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    form.status = FormStatus.PUBLISHED
    form.publishedAt = utcnow()
    db.commit()
    db.refresh(form)
    return ok(form)


@router.put("/{form_id}/draft")
def save_draft(form_id: str, body: DraftBody, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("form:write"))):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    draft = db.query(FormDraft).filter(FormDraft.formId == form.id, FormDraft.userId == auth.id).first()
    if draft:
        draft.contentJson = body.contentJson
    else:
        draft = FormDraft(formId=form.id, userId=auth.id, contentJson=body.contentJson)
        db.add(draft)
    db.commit()
    db.refresh(draft)
    return ok(draft)
