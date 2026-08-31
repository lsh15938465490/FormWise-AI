from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.http import ApiError
from app.models import Role, RolePermission, User, UserRole, UserStatus
from app.security import decode_token


class AuthUser:
    def __init__(self, id: str, tenant_id: str, email: str, name: str, roles: list[str], permissions: list[str]):
        self.id = id
        self.tenantId = tenant_id
        self.email = email
        self.name = name
        self.roles = roles
        self.permissions = permissions

    def can(self, *codes: str) -> bool:
        if "admin" in self.roles:
            return True
        return all(c in self.permissions for c in codes)

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "tenantId": self.tenantId,
            "email": self.email,
            "name": self.name,
            "roles": self.roles,
            "permissions": self.permissions,
        }


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "未登录")
    try:
        payload = decode_token(authorization[7:])
    except Exception:
        raise ApiError(401, "登录已失效") from None
    user = (
        db.query(User)
        .options(
            joinedload(User.userRoles)
            .joinedload(UserRole.role)
            .joinedload(Role.permissions)
            .joinedload(RolePermission.permission)
        )
        .filter(User.id == payload.get("userId"))
        .first()
    )
    if not user or user.status != UserStatus.ACTIVE:
        raise ApiError(401, "用户不可用")
    roles = [ur.role.code for ur in user.userRoles]
    permissions = sorted({rp.permission.code for ur in user.userRoles for rp in ur.role.permissions})
    return AuthUser(user.id, user.tenantId, user.email, user.name, roles, permissions)


def require_permission(*codes: str):
    def _inner(auth: AuthUser = Depends(get_current_user)) -> AuthUser:
        if not auth.can(*codes):
            raise ApiError(403, "无权限")
        return auth

    return _inner
