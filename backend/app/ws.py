from __future__ import annotations

from fastapi import WebSocket

from app.http import dump

_sockets: dict[str, set[WebSocket]] = {}


async def bind_socket(user_id: str, ws: WebSocket) -> None:
    _sockets.setdefault(user_id, set()).add(ws)


def unbind_socket(user_id: str, ws: WebSocket) -> None:
    group = _sockets.get(user_id)
    if not group:
        return
    group.discard(ws)
    if not group:
        _sockets.pop(user_id, None)


async def push_to_user(user_id: str, payload: dict) -> None:
    for ws in list(_sockets.get(user_id, ())):
        try:
            await ws.send_json(dump(payload) if not isinstance(payload.get("data"), dict) else payload)
        except Exception:
            unbind_socket(user_id, ws)
