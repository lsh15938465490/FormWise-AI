# FormWise-AI 功能需求说明书

| 项 | 内容 |
|----|------|
| 产品名称 | FormWise-AI（企业内部零代码表单 + 工作流平台） |
| 文档性质 | 按当前代码实现整理的功能需求与验收口径 |
| 对应代码 | 前端 `frontend/`（React 18 + Vite 5175）、后端 `backend/`（FastAPI 8002） |
| 版本日期 | 2026-09-11 |
| 演示租户 | `demo` |
| 演示账号 | 账号 `admin`（映射 `admin@formwise.local`），密码 `Admin123!` |

本文描述系统**应当做什么**，并与现网实现对齐。第 12 章列出已知边界与限制。

---

## 1. 产品定位与成功标准

### 1.1 定位

面向企业内部轻量业务（请假、报销、采购、加班、出差、业务登记等），提供：

1. 自然语言或模板生成表单（JSON Schema + UI Schema + 联动规则）；
2. 可视化编排审批流并执行（条件边、超时、抄送、通知）；
3. 填报后自动落库、进入审批、可在数据页查询与导出；
4. 基于角色的权限与站内通知（含 WebSocket）。

不要求业务人员写代码。管理员可通过插件中心登记/启停控件编码。

### 1.2 角色

| 角色代号 | 名称（界面） | 典型账号 | 权限要点 |
|----------|--------------|----------|----------|
| `admin` | 企业管理员 | `admin` / `admin@formwise.local` | 代码中 `admin` 角色绕过权限码校验；待办可看本租户全部待处理任务 |
| `manager` | 部门经理 | `manager@formwise.local` | 表单/流程只读、记录读写、处理派给自己的待办 |
| `employee` | 员工 | `employee@formwise.local` | 同上，无用户/插件管理 |

演示密码均为 `Admin123!`。同一用户可挂多个角色。审批节点按 `assigneeRole` 把待办派给该角色下所有**启用**用户；若该角色无人，回退派给 `admin`。

### 1.3 成功标准

- 管理员可用 AI 或手工创建、微调、发布表单；
- 已发布表单可填报；提交后必产生记录，并自动绑定/创建已发布流程后启动实例；
- 审批人（含管理员代看租户待办）可通过或驳回；超时任务仍可处理；
- 下拉/单选/多选无选项时系统补全可选值，填报弹窗可提交；
- 数据页按表单隔离，支持筛选、排序、导出、删除、驳回重提；
- 工作流列表可删除；画布节点/连线可删、可四边连线、可双击改名。

---

## 2. 总体架构与非功能

### 2.1 技术栈

| 层次 | 实现 |
|------|------|
| 前端 | React 18、TypeScript、Vite、React Router、Zustand、React Hook Form、Zod、Tailwind、React Flow |
| 后端 | Python 3.11、FastAPI、SQLAlchemy 2、PostgreSQL、PyJWT、bcrypt |
| 实时 | WebSocket `/ws?token=` |
| 开发 | Vite 代理 `/api`、`/health`、`/ws` → `127.0.0.1:8002` |

### 2.2 端口与约定

| 服务 | 地址 |
|------|------|
| 前端 | `http://localhost:5175` |
| 后端 | `http://localhost:8002` |
| 健康 | `GET /health`、`GET /api/health`（探库） |

统一响应：`{ "success": true/false, "message": "...", "data": ... }`。分页：`items / total / page / pageSize / totalPages`。业务错误同时给出 HTTP 状态码与 `success: false`。

### 2.3 租户与安全

- 业务数据按 `tenantId` 隔离；登录/注册需 `tenantSlug`（演示 `demo`）。
- 邮箱在租户内唯一。
- 未带 Bearer、Token 失效、用户禁用 → 401。
- 权限不足 → 403「无权限」。
- 密码最少 6 位。登录页可用别名 `admin`。

### 2.4 布局（界面）

- 整页 `html/body/#root` 不出现双层滚动条；左侧导航固定，右侧内容区滚动。
- 表单列表、工作流列表：标题区固定，表格区滚动，表头 sticky。
- 数据管理填报弹窗：字段区滚动，提交按钮固定底部；校验失败滚到第一条错误，按钮上方展示总错误。

---

## 3. 认证与工作台

### 3.1 登录 / 注册 / 当前用户

| 需求 ID | 说明 |
|---------|------|
| AUTH-LOGIN | `POST /api/auth/login`：租户不存在 404；账号密码错误 401；禁用 403；成功返回 JWT + 用户角色 |
| AUTH-ALIAS | 登录字段 `admin` 映射 `admin@formwise.local` |
| AUTH-REG | `POST /api/auth/register`：邮箱已存在 409；默认挂 `employee` 角色 |
| AUTH-ME | `GET /api/auth/me` 返回 id、邮箱、角色、权限列表 |
| AUTH-UI | 登录页默认演示账号文案仅 `admin` / `Admin123!`；无 token 访问业务页跳转 `/login` |

### 3.2 工作台

工作台展示快捷入口与概览（表单、待办、消息等，以后端实际数据为准）。侧栏菜单：工作台、AI 表单引擎、工作流引擎、数据管理、待办审批、消息中心、用户权限、插件中心。

---

## 4. 表单引擎

### 4.1 列表与生命周期

| 需求 ID | 说明 |
|---------|------|
| FORM-LIST | `GET /api/forms` 分页；管理员可见全部，普通用户仅已发布且 `visibleToRoles` 包含自己角色或为空 |
| FORM-CREATE | `POST /api/forms` 需 `form:write`；草稿状态 |
| FORM-GET | `GET /api/forms/{id}` 返回 schema，并对选择类控件执行选项补全 |
| FORM-PATCH | 改名称、可见角色、状态等 |
| FORM-DRAFT | `PUT /api/forms/{id}/draft` 保存 schemaJson / uiSchemaJson / logicJson |
| FORM-PUB | `POST /api/forms/{id}/publish` 仅已保存 schema 可发布 |
| FORM-AI | `POST /api/forms/ai-generate` 自然语言生成表单并落库（含多轮微调上下文） |
| FORM-UI-LIST | 列表可搜索、可进设计器、可发布、可删除（若接口/页支持） |

### 4.2 设计器

- 画布拖拽字段；属性面板改标题、必填、选项、校验、布局列宽。
- 多行文本、上传、子表单在两列布局下占满一行（`md:col-span-2`），避免与短字段并排留白。
- 子表单递归编辑。
- 联动：显示/隐藏、赋值、选项过滤（按 logicJson）。
- 保存草稿后可发布。

### 4.3 选项补全（填报可用）

选择类组件：`Select` / `Radio` / `Checkbox`。

- 若 schema 已有合法 `options`/`enum`，保持用户配置。
- 否则按字段名/标题关键词匹配：部门、请假类型、加班类型、岗位、性别、紧急、是否等。
- 仍未知则填充「选项一/二/三」。
- 生成、读表单、套模板、seed 均走同一补全逻辑（后端 `form_options.fill_schema_options` + 前端 `resolveFieldOptions`）。

---

## 5. 工作流引擎

### 5.1 定义 CRUD

| 需求 ID | 说明 |
|---------|------|
| WF-LIST | `GET /api/workflows` 本租户流程列表 |
| WF-CREATE | `POST /api/workflows` 创建草稿；可绑定 `formId` |
| WF-GET/PATCH | 读写节点、边（含 `sourceHandle`/`targetHandle`）、名称、绑定表单 |
| WF-PUB | 发布后填报可启动 |
| WF-DEL | `DELETE /api/workflows/{id}` 需 `workflow:write`；级联删除实例、任务、日志 |
| WF-TPL | 模板列表、创建模板、套用模板生成流程（套用时补全表单选项） |

### 5.2 画布（界面）

- 节点类型：发起、审批、条件、抄送、通知、结束。
- 审批角色下拉中文：企业管理员 / 部门经理 / 员工（存 `admin|manager|employee`）。
- 驳回规则：退回发起人 / 结束流程 / 退回上一节点。
- 节点四边均可连线（Loose 模式）；保存边的 handle。
- 选中后可删除节点/连线；`Delete`/`Backspace`。
- 双击节点名称内联改名。

### 5.3 运行时

| 需求 ID | 说明 |
|---------|------|
| WF-AUTO | 表单无已发布绑定流程时，提交记录自动创建并发布默认流（发起→部门经理审批→结束，超时 24h）再启动 |
| WF-START | 启动实例：写发起日志，从 start 推进到下一节点并派任务 |
| WF-ASSIGN | 按角色派给启用用户；无人则派给 admin；仍无人则记日志跳过 |
| WF-COND | 带 `condition` 的边优先匹配表单数据；否则走无条件边 |
| WF-END | 到达结束节点：实例通过，记录 `archived`，通知发起人 |
| WF-TIMEOUT | 后台约 30s 扫描到期 PENDING 任务改为 TIMEOUT 并通知 |
| WF-RETRY | 驳回后发起人可改数据重提，新开实例 |

默认流节点：`start` → `approve`(manager, 24h) → `end`。

---

## 6. 待办与审批

| 需求 ID | 说明 |
|---------|------|
| TODO-SELF | 非管理员：`GET /api/tasks/todo` 仅自己的 `PENDING` 与 `TIMEOUT` |
| TODO-ADMIN | 管理员：本租户全部 `PENDING`/`TIMEOUT` |
| TODO-DONE | `GET /api/tasks/done` 自己已通过/驳回，最多 50 条 |
| TODO-OK | `POST /api/tasks/{id}/approve`；同节点会签需全部通过才推进；管理员可代处理非本人任务 |
| TODO-NO | `POST /api/tasks/{id}/reject`：实例驳回，记录 `rejected`，取消其余 PENDING，通知发起人 |
| TODO-STATE | 已处理任务不可再操作（400「任务已处理」）；TIMEOUT 允许再审 |

界面：待办列表展示流程名、节点、到达时间；通过/驳回可填意见。

---

## 7. 数据管理 / 填报

| 需求 ID | 说明 |
|---------|------|
| REC-LIST | `GET /api/forms/{formId}/records` 分页、筛选、排序；仅该表单数据 |
| REC-CREATE | `POST` 仅已发布表单；返回 `record` + `instance`（流程必须启动成功，否则 500 且提示记录已保存） |
| REC-GET/PATCH/DEL | 单条读写删 |
| REC-EXPORT | 导出 xlsx |
| REC-RETRY | 驳回记录重提 |
| REC-UI | 表单下拉同名带时间；记住 `sessionStorage` 的 `formwise.records.formId`；空列表提示切换表单 |
| REC-VALID | 前端 Zod + RHF：必填、类型、提交失败展示；错误时滚动到首条 |

填报入口：数据管理弹窗、独立 `/forms/:id/submit`。

---

## 8. 用户、角色、插件、消息

### 8.1 用户权限

- `GET /api/users` 列表；`PATCH` 改状态/资料；`POST /{id}/roles` 赋角色。
- `GET /api/roles`、权限列表、创建角色、更新角色权限。
- 仅管理员菜单进入用户权限页。

### 8.2 插件

- 插件列表、启用/停用；前端按启用 code 同步控件注册表。
- 停用后对应控件不应再作为新字段可选（已有表单仍按 schema 渲染）。

### 8.3 消息

- `GET /api/notifications`；单条已读、全部已读。
- 流程待办/通过/驳回/超时写入通知；WebSocket 推送刷新铃铛未读数。

---

## 9. 权限码一览

| 码 | 用途 |
|----|------|
| `form:read` / `form:write` | 表单 |
| `workflow:read` / `workflow:write` | 流程 |
| `record:read` / `record:write` | 记录 |
| 用户/角色/插件写操作 | 管理员或对应权限 |

`admin` 角色始终 `can(*)` 为真。

---

## 10. 数据实体（逻辑）

- Tenant、User、Role、Permission、UserRole、RolePermission
- Form（schemaJson、uiSchemaJson、logicJson、status、visibleToRoles）
- FormRecord（dataJson、status：submitted/archived/rejected）
- WorkflowDefinition（definitionJson、formId、status）
- WorkflowInstance、WorkflowTask、WorkflowLog
- Notification、Plugin 登记

---

## 11. 接口清单（验收用）

认证：`/api/auth/login|register|me`  
表单：`/api/forms` CRUD、draft、publish、ai-generate  
记录：`/api/forms/{id}/records` 列表/创建/导出；`/api/records/{id}` 读写删；retry  
流程：`/api/workflows` CRUD、publish、delete；templates；instances  
任务：`/api/tasks/todo|done`；`/{id}/approve|reject`  
用户角色插件通知：`/api/users`、`/api/roles`、`/api/plugins`、`/api/notifications`  
健康：`/health`、`/api/health`

---

## 12. 边界与限制（需求级）

- 超时扫描会把超期 PENDING 改为 TIMEOUT；待办必须同时展示 TIMEOUT，否则列表会「变空」。
- 条件边表达式能力以 `edge_matches` 为准，非法条件视为不匹配。
- AI 生成依赖配置的模型服务；失败应返回明确错误而非空白表单。
- 多租户禁止串数据。
- 工作流删除不可恢复。
- 登录别名目前仅 `admin`，`manager`/`employee` 须用完整邮箱。
- Redis 在 Compose 中存在，主路径不强制依赖。
