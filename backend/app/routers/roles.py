from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import AuthUser, require_permission
from app.http import ApiError, dump, ok
from app.models import Permission, Role, RolePermission

router = APIRouter(prefix="/api/roles", tags=["roles"])


class CreateRole(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    permissionIds: list[str] | None = None


class SetPerms(BaseModel):
    permissionIds: list[str]


def _role_out(role: Role) -> dict:
    return dump(
        role,
        extra={"permissions": [{"permission": dump(rp.permission)} for rp in role.permissions]},
    )


@router.get("")
def list_roles(db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("role:read"))):
    roles = (
        db.query(Role)
        .options(joinedload(Role.permissions).joinedload(RolePermission.permission))
        .filter(Role.tenantId == auth.tenantId)
        .order_by(Role.createdAt.asc())
        .all()
    )
    return ok([_role_out(r) for r in roles])


@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("role:read"))):
    items = db.query(Permission).order_by(Permission.code.asc()).all()
    return ok(items)


@router.post("", status_code=201)
def create_role(body: CreateRole, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("role:write"))):
    role = Role(tenantId=auth.tenantId, code=body.code, name=body.name, description=body.description)
    db.add(role)
    db.flush()
    for pid in body.permissionIds or []:
        db.add(RolePermission(roleId=role.id, permissionId=pid))
    db.commit()
    role = db.query(Role).options(joinedload(Role.permissions).joinedload(RolePermission.permission)).filter(Role.id == role.id).one()
    return ok(_role_out(role))


@router.put("/{role_id}/permissions")
def set_permissions(role_id: str, body: SetPerms, db: Session = Depends(get_db), auth: AuthUser = Depends(require_permission("role:write"))):
    role = db.query(Role).filter(Role.id == role_id, Role.tenantId == auth.tenantId).first()
    if not role:
        raise ApiError(404, "角色不存在")
    db.query(RolePermission).filter(RolePermission.roleId == role.id).delete()
    for pid in body.permissionIds:
        db.add(RolePermission(roleId=role.id, permissionId=pid))
    db.commit()
    role = db.query(Role).options(joinedload(Role.permissions).joinedload(RolePermission.permission)).filter(Role.id == role.id).one()
    return ok(_role_out(role))
