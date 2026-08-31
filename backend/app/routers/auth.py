from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import AuthUser, get_current_user
from app.http import ApiError, ok
from app.models import Role, Tenant, User, UserRole, UserStatus
from app.security import create_token, hash_password, verify_password
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str = Field(min_length=6)
    tenantSlug: str = "demo"


class RegisterBody(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    tenantSlug: str = "demo"


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.slug == body.tenantSlug).first()
    if not tenant:
        raise ApiError(404, "租户不存在")
    user = (
        db.query(User)
        .options(joinedload(User.userRoles).joinedload(UserRole.role))
        .filter(User.tenantId == tenant.id, User.email == body.email)
        .first()
    )
    if not user or not verify_password(body.password, user.passwordHash):
        raise ApiError(401, "邮箱或密码错误")
    if user.status != UserStatus.ACTIVE:
        raise ApiError(403, "账号已禁用")
    token = create_token(user.id, user.tenantId, user.email)
    return ok(
        {
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "tenantId": user.tenantId,
                "roles": [ur.role.code for ur in user.userRoles],
            },
        }
    )


@router.post("/register", status_code=201)
def register(body: RegisterBody, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter(Tenant.slug == body.tenantSlug).first()
    if not tenant:
        raise ApiError(404, "租户不存在")
    if db.query(User).filter(User.tenantId == tenant.id, User.email == body.email).first():
        raise ApiError(409, "邮箱已注册")
    employee = db.query(Role).filter(Role.tenantId == tenant.id, Role.code == "employee").first()
    user = User(tenantId=tenant.id, email=body.email, passwordHash=hash_password(body.password), name=body.name)
    db.add(user)
    db.flush()
    if employee:
        db.add(UserRole(userId=user.id, roleId=employee.id))
    db.commit()
    token = create_token(user.id, user.tenantId, user.email)
    return ok({"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}})


@router.get("/me")
def me(auth: AuthUser = Depends(get_current_user)):
    return ok(auth.as_dict())
