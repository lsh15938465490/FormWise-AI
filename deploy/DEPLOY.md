# FormWise-AI 云服务器 Docker 部署

单机用 Docker Compose：Nginx（前端）+ FastAPI + PostgreSQL。浏览器只访问 **80** 端口，`/api`、`/health`、`/ws` 由 Nginx 转到后端。

## 环境要求

- Linux 云主机（建议 2 核 2G 以上）
- Docker 与 Docker Compose 插件
- 安全组放行 **80**（可选 443）

## 步骤

```bash
git clone <你的仓库地址> FormWise-AI
cd FormWise-AI
cp .env.example .env
# 编辑 .env：JWT_SECRET、POSTGRES_PASSWORD、CORS_ORIGIN
docker compose up -d --build
```

浏览器打开 `http://服务器公网IP`。

首次空库会写入演示账号：

- 邮箱 `admin@formwise.local`
- 密码 `Admin123!`
- 租户 slug：`demo`

登录后请立刻改密码。

## .env 要点

| 变量 | 说明 |
|------|------|
| `WEB_PORT` | 宿主机映射端口，默认 80 |
| `JWT_SECRET` | 生产必须改掉 |
| `POSTGRES_PASSWORD` | 生产必须改掉 |
| `CORS_ORIGIN` | 公网访问地址，如 `http://192.168.1.10` 或 `https://formwise.example.com` |
| `SEED_IF_EMPTY` | `true` 时仅空库播种，重启不会清数据 |

## 常用命令

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f web
curl http://127.0.0.1/health
docker compose down          # 停服务，保留数据卷
docker compose down -v       # 停服务并删除数据库卷
```

## HTTPS

在云主机再挂一层 Caddy / Nginx，把 443 反代到本机 `WEB_PORT`。`CORS_ORIGIN` 改成 `https://你的域名`。

## 本地开发不要用这份编排

开发仍可用 `backend/docker-compose.yml` 只起 PostgreSQL（映射 5433），前端 5175、后端 8002 在宿主机跑。
