# FormWise-AI 后端（Python / FastAPI）

与前端约定的 HTTP 接口保持不变：JWT、`{ success, data }`、路径仍为 `/api/...`。

## 启动

```bash
cd backend
docker compose up -d
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8002
```

- 服务地址：http://localhost:8002
- 演示账号：`admin@formwise.local` / `Admin123!`

## 目录

```
app/
  main.py              # FastAPI 入口、CORS、WebSocket
  models.py            # 数据表（与 PostgreSQL 对齐）
  routers/             # 按业务拆分的接口
  workflow_engine.py   # 审批流转
  ai_parser.py         # 自然语言生成表单
  seed.py              # 演示数据
```
