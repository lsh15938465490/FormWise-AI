from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import AuthUser, get_current_user
from app.http import ok
from app.models import Notification, NotificationCategory

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(category: str | None = None, db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    q = db.query(Notification).filter(Notification.userId == auth.id)
    if category:
        q = q.filter(Notification.category == NotificationCategory(category))
    items = q.order_by(Notification.createdAt.desc()).limit(100).all()
    return ok(items)


@router.patch("/{nid}/read")
def mark_read(nid: str, db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == nid, Notification.userId == auth.id).update({"isRead": True})
    db.commit()
    return ok({"count": n})


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), auth: AuthUser = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.userId == auth.id, Notification.isRead.is_(False)).update({"isRead": True})
    db.commit()
    return ok({"count": n})
