from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import engine, ensure_schema
from app.http import ApiError
from app.models import Base
from app.routers.auth import router as auth_router
from app.routers.forms import router as forms_router
from app.routers.misc import job_router, plugin_router
from app.routers.notifications import router as notification_router
from app.routers.records import router as records_router
from app.routers.roles import router as roles_router
from app.routers.users import router as users_router
from app.routers.workflows import router as workflow_router
from app.routers.workflows import task_router
from app.security import decode_token
from app.workflow_engine import scan_timeouts
from app.ws import bind_socket, unbind_socket


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    stop = asyncio.Event()

    async def timeout_loop():
        while not stop.is_set():
            try:
                await scan_timeouts()
            except Exception:
                pass
            try:
                await asyncio.wait_for(stop.wait(), timeout=30)
            except asyncio.TimeoutError:
                continue

    task = asyncio.create_task(timeout_loop())
    yield
    stop.set()
    task.cancel()


settings = get_settings()
app = FastAPI(title="FormWise-AI Backend", lifespan=lifespan, redirect_slashes=False)


def _cors_origins() -> list[str]:
    items = [o.strip() for o in (settings.CORS_ORIGIN or "").split(",") if o.strip()]
    for extra in ("http://localhost:5175", "http://127.0.0.1:5175"):
        if extra not in items:
            items.append(extra)
    return items


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ApiError)
async def api_error_handler(_req: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


@app.exception_handler(RequestValidationError)
async def valid_error_handler(_req: Request, exc: RequestValidationError):
    details = jsonable_encoder(exc.errors(), custom_encoder={Exception: str})
    return JSONResponse(status_code=400, content={"success": False, "message": "参数校验失败", "details": details})


@app.exception_handler(Exception)
async def unhandled_error(_req: Request, exc: Exception):
    if settings.NODE_ENV == "production":
        return JSONResponse(status_code=500, content={"success": False, "message": "服务器内部错误"})
    return JSONResponse(status_code=500, content={"success": False, "message": str(exc)})


@app.get("/health")
def health():
    return {"success": True, "service": "formwise-ai-backend", "status": "up"}


@app.get("/api/health")
def api_health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"success": True, "db": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = ""):
    try:
        payload = decode_token(token)
        user_id = payload.get("userId")
        if not user_id:
            await ws.close()
            return
    except Exception:
        await ws.close()
        return
    await ws.accept()
    await bind_socket(user_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        unbind_socket(user_id, ws)


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(forms_router)
app.include_router(workflow_router)
app.include_router(task_router)
app.include_router(records_router)
app.include_router(notification_router)
app.include_router(plugin_router)
app.include_router(job_router)
