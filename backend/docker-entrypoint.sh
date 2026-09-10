#!/bin/sh
set -e
python - <<'PY'
import time
from sqlalchemy import create_engine, text
from app.config import get_settings

engine = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True)
for i in range(60):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("database ready")
        break
    except Exception as exc:
        print(f"waiting for database ({i + 1}/60): {exc}")
        time.sleep(2)
else:
    raise SystemExit("database is not ready")
PY

if [ "${SEED_IF_EMPTY:-true}" = "true" ]; then
  python -m app.seed
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8002 --proxy-headers --forwarded-allow-ips="*"
