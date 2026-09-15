from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import Text, asc, cast, desc
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import AuthUser, require_permission
from app.excel_export import records_to_xlsx
from app.http import ApiError, dump, ok, paginated
from app.models import Form, FormRecord, FormStatus, WorkflowInstance
from app.workflow_engine import ensure_published_workflow, retry_rejected, start_workflow

router = APIRouter(tags=["records"])


class DataBody(BaseModel):
    dataJson: dict


@router.get("/api/forms/{form_id}/records")
def list_records(
    form_id: str,
    page: int = 1,
    pageSize: int = 20,
    status: str = "",
    keyword: str = "",
    sort: str = "",
    order: str = "desc",
    db: Session = Depends(get_db),
    auth: AuthUser = Depends(require_permission("record:read")),
):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    page = max(1, page)
    page_size = min(100, max(1, pageSize))
    q = db.query(FormRecord).filter(FormRecord.formId == form.id, FormRecord.tenantId == auth.tenantId)
    if status.strip():
        q = q.filter(FormRecord.status == status.strip())
    if keyword.strip():
        q = q.filter(cast(FormRecord.dataJson, Text).ilike(f"%{keyword.strip()}%"))
    sort_key = sort.strip()
    if sort_key and not __import__("re").fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", sort_key):
        sort_key = ""
    if sort_key and sort_key not in {"createdAt", "status", "id"}:
        col = FormRecord.dataJson[sort_key].astext
        q = q.order_by(asc(col) if order == "asc" else desc(col))
    elif sort_key == "status":
        q = q.order_by(asc(FormRecord.status) if order == "asc" else desc(FormRecord.status))
    else:
        q = q.order_by(asc(FormRecord.createdAt) if order == "asc" else desc(FormRecord.createdAt))
    total = q.count()
    rows = (
        q.options(joinedload(FormRecord.creator))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [dump(r, extra={"creator": dump(r.creator, exclude={"passwordHash"}) if r.creator else None}) for r in rows]
    return paginated(items, total, page, page_size)


@router.get("/api/forms/{form_id}/records/export")
def export_records(form_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("record:read"))):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId).first()
    if not form:
        raise ApiError(404, "表单不存在")
    props = (form.schemaJson or {}).get("properties") or {}
    field_keys = []
    titles = []
    for key, spec in props.items():
        field_keys.append(key)
        title = spec.get("title") if isinstance(spec, dict) else None
        titles.append(str(title or key))
    headers = ["编号", "状态", *titles]
    rows = db.query(FormRecord).filter(FormRecord.formId == form.id, FormRecord.tenantId == auth.tenantId).order_by(FormRecord.createdAt.desc()).all()
    status_map = {"submitted": "审批中", "archived": "已通过", "rejected": "已驳回"}
    data = []
    for r in rows:
        payload = r.dataJson or {}
        data.append([r.id, status_map.get(r.status, r.status), *[str(payload.get(f, "")) for f in field_keys]])
    content = records_to_xlsx(headers, data)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=\"data.xlsx\"; filename*=UTF-8''%E4%B8%9A%E5%8A%A1%E6%95%B0%E6%8D%AE.xlsx"},
    )


@router.post("/api/forms/{form_id}/records", status_code=201)
async def create_record(
    form_id: str,
    body: DataBody,
    db: Session = Depends(get_db),
    auth: AuthUser = Depends(require_permission("record:write")),
):
    form = db.query(Form).filter(Form.id == form_id, Form.tenantId == auth.tenantId, Form.status == FormStatus.PUBLISHED).first()
    if not form:
        raise ApiError(404, "已发布表单不存在")
    record = FormRecord(tenantId=auth.tenantId, formId=form.id, dataJson=body.dataJson, createdById=auth.id, status="submitted")
    db.add(record)
    db.commit()
    db.refresh(record)
    instance = None
    try:
        wf = ensure_published_workflow(db, form=form, user_id=auth.id)
        instance = await start_workflow(db, tenant_id=auth.tenantId, workflow_id=wf.id, record_id=record.id, form_id=form.id, initiator_id=auth.id)
        record = db.query(FormRecord).filter(FormRecord.id == record.id).one()
    except ApiError:
        raise
    except Exception as exc:
        db.rollback()
        raise ApiError(500, f"记录已保存，流程启动失败：{exc}") from exc
    inst_out = None
    if instance:
        logs = sorted(instance.logs, key=lambda x: x.createdAt)
        inst_out = dump(instance, extra={"tasks": dump(instance.tasks), "logs": dump(logs)})
    return ok({"record": dump(record), "instance": inst_out})


@router.get("/api/records/{record_id}")
def get_record(record_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("record:read"))):
    rec = (
        db.query(FormRecord)
        .options(
            joinedload(FormRecord.form),
            joinedload(FormRecord.instances).joinedload(WorkflowInstance.tasks),
            joinedload(FormRecord.instances).joinedload(WorkflowInstance.logs),
        )
        .filter(FormRecord.id == record_id, FormRecord.tenantId == auth.tenantId)
        .first()
    )
    if not rec:
        raise ApiError(404, "记录不存在")
    instances = []
    for inst in rec.instances:
        instances.append(dump(inst, extra={"tasks": dump(inst.tasks), "logs": dump(inst.logs)}))
    return ok(dump(rec, extra={"form": dump(rec.form), "instances": instances}))


@router.patch("/api/records/{record_id}")
def patch_record(record_id: str, body: DataBody, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("record:write"))):
    rec = db.query(FormRecord).filter(FormRecord.id == record_id, FormRecord.tenantId == auth.tenantId).first()
    if not rec:
        raise ApiError(404, "记录不存在")
    rec.dataJson = body.dataJson
    db.commit()
    db.refresh(rec)
    return ok(rec)


@router.delete("/api/records/{record_id}")
def delete_record(record_id: str, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("record:write"))):
    rec = db.query(FormRecord).filter(FormRecord.id == record_id, FormRecord.tenantId == auth.tenantId).first()
    if not rec:
        raise ApiError(404, "记录不存在")
    db.delete(rec)
    db.commit()
    return ok({"id": record_id})


@router.post("/api/records/{record_id}/retry")
async def retry_record(record_id: str, body: DataBody, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("record:write"))):
    inst = await retry_rejected(db, tenant_id=auth.tenantId, record_id=record_id, user_id=auth.id, data_json=body.dataJson)
    logs = sorted(inst.logs, key=lambda x: x.createdAt)
    return ok(dump(inst, extra={"tasks": dump(inst.tasks), "logs": dump(logs)}))
