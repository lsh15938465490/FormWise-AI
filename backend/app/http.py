from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import DeclarativeBase


class ApiError(HTTPException):
    def __init__(self, status: int, message: str, details: Any = None):
        super().__init__(status_code=status, detail={"success": False, "message": message, "details": details})
        self.message = message
        self.details = details


def dump(obj: Any, extra: dict | None = None, exclude: set[str] | None = None) -> Any:
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: dump(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [dump(x) for x in obj]
    if hasattr(obj, "__table__"):
        skip = exclude or set()
        data = {}
        for col in obj.__table__.columns:
            if col.key in skip:
                continue
            data[col.name] = dump(getattr(obj, col.key))
        if extra:
            data.update(extra)
        return data
    return jsonable_encoder(obj)


def ok(data: Any, message: str = "ok") -> dict:
    return {"success": True, "message": message, "data": dump(data)}


def paginated(items: list, total: int, page: int, page_size: int) -> dict:
    return ok(
        {
            "items": dump(items),
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": max(1, (total + page_size - 1) // page_size) if page_size else 1,
        }
    )
