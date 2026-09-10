# FormWise-AI

面向企业内部的 AI 驱动零代码应用搭建平台。

## 仓库结构

- `backend/`：Python FastAPI + SQLAlchemy + PostgreSQL
- `frontend/`：React 18 前端（Vite、Zustand、插件化表单渲染、React Flow）
- `需求文档/`：产品需求文档

## 快速启动

后端见 `backend/README.md`（默认 `http://localhost:8002`）。

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器：`http://localhost:5175`，接口通过 Vite 代理到 8002。

云服务器 Docker 部署见 `deploy/DEPLOY.md`（项目根目录执行 `docker compose up -d --build`）。
