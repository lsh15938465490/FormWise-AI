from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import AuthUser, require_permission
from app.http import ApiError, dump, ok, paginated
from app.models import Role, User, UserRole, UserStatus

router = APIRouter(prefix="/api/users", tags=["users"])


class PatchUser(BaseModel):
    name: str | None = None
    department: str | None = None
    position: str | None = None
    status: UserStatus | None = None


class SetRoles(BaseModel):
    roleIds: list[str]


@router.get("")
def list_users(
    page: int = 1,
    pageSize: int = 20,
    keyword: str = "",
    db: Session = Depends(get_db),
    auth: AuthUser = Depends(require_permission("user:read")),
):
    page = max(1, page)
    page_size = min(100, max(1, pageSize))
    q = db.query(User).filter(User.tenantId == auth.tenantId)
    if keyword.strip():
        like = f"%{keyword.strip()}%"
        q = q.filter((User.name.ilike(like)) | (User.email.ilike(like)))
    total = q.count()
    rows = (
        q.options(joinedload(User.userRoles).joinedload(UserRole.role))
        .order_by(User.createdAt.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        dump(
            u,
            exclude={"passwordHash"},
            extra={
                "userRoles": [{"role": {"id": ur.role.id, "code": ur.role.code, "name": ur.role.name}} for ur in u.userRoles],
            },
        )
        for u in rows
    ]
    return paginated(items, total, page, page_size)


@router.patch("/{user_id}")
def patch_user(
    user_id: str,
    body: PatchUser,
    db: Session = Depends(get_db),
    auth: AuthUser = Depends(require_permission("user:write")),
):
    user = db.query(User).filter(User.id == user_id, User.tenantId == auth.tenantId).first()
    if not user:
        raise ApiError(404, "用户不存在")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(user, key, val)
    db.commit()
    db.refresh(user)
    return ok(dump(user, exclude={"passwordHash"}))


@router.post("/{user_id}/roles")
def set_roles(
    user_id: str,
    body: SetRoles,
    db: Session = Depends(get_db),
    auth: AuthUser = Depends(require_permission("role:write")),
):
    user = db.query(User).filter(User.id == user_id, User.tenantId == auth.tenantId).first()
    if not user:
        raise ApiError(404, "用户不存在")
    roles = db.query(Role).filter(Role.id.in_(body.roleIds), Role.tenantId == auth.tenantId).all()
    if len(roles) != len(body.roleIds):
        raise ApiError(400, "角色不属于当前企业")
    db.query(UserRole).filter(UserRole.userId == user.id).delete()
    for rid in body.roleIds:
        db.add(UserRole(userId=user.id, roleId=rid))
    db.commit()
    return ok({"userId": user.id, "roleIds": body.roleIds})
