# FormWise-AI 系统需求说明书（按现有实现）

| 项 | 内容 |
|----|------|
| 文档性质 | 根据当前仓库代码整理的**已实现需求**说明，不是愿景清单 |
| 产品名称 | FormWise-AI（企业内部零代码表单 + 工作流平台） |
| 版本对应 | 前端 `frontend/`（React 18 + Vite）、后端 `backend/`（Python FastAPI） |
| 整理日期 | 2026-09-01 |

本文描述系统**已经能做什么、规则如何、接口与数据如何约束**。未实现或仅部分实现的能力在第 12 章单独列出，避免与代码脱节。

---

## 1. 产品定位与目标用户

### 1.1 定位

面向企业内部轻量业务（请假、报销、采购、加班、出差、业务登记等），提供：

1. 用自然语言或模板生成表单配置（JSON Schema + 布局 + 联动）；
2. 可视化编排审批流程并执行；
3. 提交后自动生成数据列表与归档；
4. 基于角色的操作权限与站内实时通知。

不要求业务人员编写代码。信息化人员可通过插件注册中心扩展控件编码登记，运行时组件仍以后端启用状态与前端内置实现为准。

### 1.2 使用角色（演示租户 `demo`）

| 角色代号 | 名称 | 典型账号 | 默认权限范围 |
|----------|------|----------|----------------|
| `admin` | 企业管理员 | `admin@formwise.local` | 全部权限码（代码中 `admin` 角色直接绕过权限校验） |
| `manager` | 部门经理 | `manager@formwise.local` | `form:read`、`workflow:read`、`record:read`、`record:write` |
| `employee` | 员工 | `employee@formwise.local` | `form:read`、`workflow:read`、`record:read`、`record:write` |

演示密码均为 `Admin123!`。同一用户可挂多个角色；审批节点按角色代号（如 `manager`）把待办派给该角色下所有**启用**用户。

### 1.3 成功标准（当前实现可验收）

- 管理员能生成/微调/发布表单，并绑定已发布流程；
- 员工能填写已发布且对其可见的表单，提交后产生记录与流程实例（若已绑定流程）；
- 审批人能在待办中通过或驳回，发起人能收到站内通知；
- 条件边能按表单字段表达式分流；
- 数据页能筛选、排序、导出 Excel、CRUD 与驳回重提。

---

## 2. 总体架构

### 2.1 技术栈

| 层次 | 实现 |
|------|------|
| 前端 | React 18、TypeScript、Vite 7、React Router、Zustand、React Hook Form、Zod、Tailwind、React Flow（`@xyflow/react`） |
| 后端 | Python 3.11、FastAPI、SQLAlchemy 2、PostgreSQL、PyJWT、bcrypt |
| 实时通道 | WebSocket，路径 `/ws?token=` |
| 开发代理 | Vite 将 `/api`、`/health`、`/ws` 代理到 `127.0.0.1:3001` |
| 数据存储 | PostgreSQL（Docker 映射主机 `5433`）。Compose 中含 Redis，当前业务主路径**未强制依赖 Redis** |

### 2.2 部署与端口

| 服务 | 默认地址 |
|------|----------|
| 前端开发服务器 | `http://localhost:5173` |
| 后端 HTTP / WS | `http://localhost:3001` |
| 健康检查 | `GET /health`、`GET /api/health`（后者探测数据库） |

统一 HTTP 响应：`{ "success": true/false, "message": "...", "data": ... }`。分页：`data.items / total / page / pageSize / totalPages`。失败时 HTTP 状态码与 `success: false` 同时给出。

### 2.3 租户模型

所有业务数据按 `tenantId` 隔离。登录、注册需指定 `tenantSlug`（演示为 `demo`）。用户邮箱在租户内唯一。

---

## 3. 功能需求：认证与工作台

### 3.1 登录 / 注册 / 当前用户

| 需求 | 说明 |
|------|------|
| FR-AUTH-01 登录 | `POST /api/auth/login`，邮箱 + 密码 + `tenantSlug`。校验租户、密码、账号状态 `ACTIVE`。返回 JWT 与用户基本信息、角色列表。 |
| FR-AUTH-02 注册 | `POST /api/auth/register`。在指定租户创建用户，默认挂 `employee` 角色（若存在）。邮箱冲突返回 409。 |
| FR-AUTH-03 会话 | JWT 载荷含 `userId`、`tenantId`、`email`，HS256，默认约 7 天。请求头 `Authorization: Bearer <token>`。 |
| FR-AUTH-04 当前用户 | `GET /api/auth/me` 返回 id、租户、邮箱、姓名、角色、权限码列表。 |
| FR-AUTH-05 前端守卫 | 无 token 访问业务路由一律跳转 `/login`。401 且非登录接口时前端清空会话。 |

禁用账号（`DISABLED`）不可登录，已登录用户若被禁用则后续鉴权失败。

### 3.2 工作台

| 需求 | 说明 |
|------|------|
| FR-DASH-01 | 展示当前用户可见的表单数量、工作流数量、待办条数、插件数、流程实例数，卡片可跳转到对应模块。 |

---

## 4. 功能需求：AI 表单配置引擎

### 4.1 表单生命周期

| 状态 | 含义 |
|------|------|
| `DRAFT` | 草稿，无 `form:write` 的用户在列表中看不到 |
| `PUBLISHED` | 已发布，员工可填写（还需通过可见角色过滤） |
| `ARCHIVED` | 模型已预留，当前主流程以草稿/已发布为主 |

字段配置以 JSON 存储：

- `schemaJson`：JSON Schema（`type/object`、`properties`、`required`），属性上扩展 `component`、`title`、`options`、`validations`、`placeholder`、`itemFields`；
- `layoutJson`：分组 `{ groups: [{ key, title, fields[] }] }`，可含 `tip` 布局说明；
- `linkageJson`：`{ rules: [{ source, target, type, optionMap? }] }`，当前执行类型为 `filter-options`；
- `dataModelJson`：字段名/类型/必填摘要；
- `visibleRoleCodes`：字符串数组。空或未配 = 有 `form:read` 即可看见；非空则角色代号需命中其一（`admin` 角色始终可见）。

### 4.2 自然语言生成与对话微调

| 需求 | 说明 |
|------|------|
| FR-FORM-01 生成新表 | `POST /api/forms/ai-generate`，body：`{ prompt }`（至少 4 字）。默认用关键词规则解析中文需求，生成字段、分组、联动与表单记录（状态草稿）。 |
| FR-FORM-02 对话微调 | 同一接口带 `formId` 时，在**已有表**上按新提示合并字段（如「增加加班类型」）、删除（「删除xxx」）、设必填，不新建表。 |
| FR-FORM-03 可选大模型 | 配置 `OPENAI_API_KEY` 且 `AI_PROVIDER` 不为 `mock` 时，优先请求 Chat Completions，失败回退规则引擎。 |
| FR-FORM-04 关键词字段 | 规则引擎可识别并生成：姓名、部门、岗位、请假类型/时长/事由、金额、起止日期、手机、加班类型、明细子表等。 |
| FR-FORM-05 布局推荐 | 部门+岗位并入基础信息并给出 tip；金额进业务区；出现明细则加入 SubForm。 |
| FR-FORM-06 部门岗位联动 | 同时存在 `department` 与 `position` 时写入 `filter-options` 及按部门的 `optionMap`。填写时按源字段值刷新目标下拉。 |

规则引擎表名推断：文案含请假/报销/采购/加班/出差时使用对应中文表名，否则为「业务登记表」。

### 4.3 可视化设计与预览

| 需求 | 说明 |
|------|------|
| FR-FORM-07 列表 | `GET /api/forms` 分页。无 `form:write` 只返回已发布。再按 `visibleRoleCodes` 过滤。 |
| FR-FORM-08 设计页 | 左侧提示词、生成/微调、保存、发布、字段列表、可见角色（逗号分隔角色代号）。中间实时预览。右侧改显示名、组件、分组、占位、必填、最小值、选项（`显示名:取值` 每行一条）、上下移、删除。 |
| FR-FORM-09 草稿 | 设计页脏数据约 1.5 秒自动 `PUT /api/forms/{id}/draft`。刷新设计页优先用当前用户草稿。 |
| FR-FORM-10 保存/发布 | `PATCH` 更新配置；`POST .../publish` 置为 `PUBLISHED` 并写 `publishedAt`。仅发布后出现「填写」。 |
| FR-FORM-11 TypeScript 预览 | 设计页根据当前 Schema 生成 `export interface FormValues { ... }` 文本，保证配置与类型对照。 |
| FR-FORM-12 手工建表 | `POST /api/forms` 可直接提交 Schema 等 JSON。 |

无 `form:write` 的用户列表中不显示「设计」「AI 生成表单」。

### 4.4 动态渲染与校验

| 需求 | 说明 |
|------|------|
| FR-FORM-13 控件 | 插件注册：Input、Textarea、Select、NumberInput、DatePicker、Upload、Radio、Checkbox、SubForm。 |
| FR-FORM-14 渲染 | 按 `layoutJson` 分组、两列栅格；预览与提交共用画布。 |
| FR-FORM-15 子表单 | `SubForm` 按 `itemFields` 递归渲染行内控件，可增删行。无 `itemFields` 时默认单行 `content`。 |
| FR-FORM-16 校验 | 填写页 React Hook Form + 由 Schema 生成的 Zod：必填、数字、最小值/最大值、正则（如手机）、多选至少一项、子表必填时至少一行。 |
| FR-FORM-17 状态层 | `useFormEngine` 统一管理填写值、校验错误、提交中状态。搭建预览值在 Zustand 表单搭建 store。 |
| FR-FORM-18 上传 | 当前仅记录所选文件的**文件名字符串**，不落对象存储。 |

---

## 5. 功能需求：可视化工作流

### 5.1 流程定义

节点类型（画布可拖拽，与插件编码一致）：

| type | 名称 | 执行行为 |
|------|------|----------|
| `start` | 发起 | 提交后从该节点沿出边前进 |
| `approve` | 审批 | 按 `assigneeRole` 给对应用户建 `PENDING` 待办 |
| `cc` | 抄送 | 建抄送类任务并通知，无抄送人则记日志跳过 |
| `notify` | 通知 | 同通知类任务 |
| `condition` | 条件 | 不建待办，按出边条件立即继续前进 |
| `end` | 结束 | 全部下一跳为结束则实例 `APPROVED`，记录 `archived` |

节点可配置：名称、审批角色（`admin` / `manager` / `employee`）、超时小时数、驳回规则说明（说明字段，驳回逻辑当前为整单驳回）。

边可配置 `condition`。语法：`字段名` + `== != > < >= <=` + 数字或字符串。例如 `amount>100`、`leaveType==annual`。

**分流规则：** 先收集带条件的出边，命中则只走命中边；若无命中，再走无条件出边。

### 5.2 模板库

| 需求 | 说明 |
|------|------|
| FR-WF-01 内置模板 | 种子数据：员工请假、费用报销、物资采购、加班申请、出差审批（分类人事/财务/行政）。定义均为「发起 → 经理审批 → 结束」，表单 Schema 为请假字段样例。 |
| FR-WF-02 套用 | `POST /api/workflows/templates/{id}/apply`：生成**已发布**表单 + **已发布**流程并绑定。需 `workflow:write`。 |
| FR-WF-03 自定义模板 | 画布「存为模板」：`POST /api/workflows/templates`，`tenantId` 为当前租户，`isBuiltin=false`。 |
| FR-WF-04 模板列表 | 返回租户为空（内置）或等于当前租户的模板。 |

### 5.3 编排与发布

| 需求 | 说明 |
|------|------|
| FR-WF-05 列表/详情 | 分页列表、按 id 查询，租户隔离。 |
| FR-WF-06 画布 | React Flow：拖拽节点、连线、点节点改属性、点连线改条件、绑定已发布表单、保存、发布。 |
| FR-WF-07 发布 | `POST /api/workflows/{id}/publish`，状态 `PUBLISHED`。提交记录时取该表单**最新已发布**流程启动实例。 |

未绑定流程或流程未发布时，提交只入库，不产生待办。

### 5.4 流程执行引擎

| 需求 | 说明 |
|------|------|
| FR-WF-08 启动 | 创建 `WorkflowInstance`（`IN_PROGRESS`），记 submit 日志，从 start 前进。 |
| FR-WF-09 会签 | 同一审批节点多名审批人时，**全部通过**才进入下一跳。 |
| FR-WF-10 通过 | 任务 `APPROVED`，写日志，通知逻辑见消息章。 |
| FR-WF-11 驳回 | 当前任务 `REJECTED`，其余未处理任务 `CANCELLED`，实例 `REJECTED`，记录 `rejected`，通知发起人。 |
| FR-WF-12 结束通过 | 记录 `archived`，通知发起人「流程已通过」。 |
| FR-WF-13 超时 | 服务启动后每约 30 秒扫描 `dueAt < now` 且仍 `PENDING` 的任务，置 `TIMEOUT`，通知审批人与发起人。超时**不自动整单结束**。 |
| FR-WF-14 重提 | `POST /api/records/{id}/retry`：仅记录创建人可把驳回单改数据后重新 `start_workflow`（新实例）。 |

### 5.5 待办与追踪

| 需求 | 说明 |
|------|------|
| FR-WF-15 待办/已办 | `GET /api/tasks/todo`、`/done`。待办为指派给自己且 `PENDING`；已办为 `APPROVED` 或 `REJECTED`。 |
| FR-WF-16 审批操作 | `POST /api/tasks/{id}/approve|reject`，可选 `comment`。 |
| FR-WF-17 实例列表 | 最近 50 条，含 workflow、tasks、logs。 |
| FR-WF-18 追踪页 | 左侧实例列表；右侧只读流程图（节点颜色反映任务/当前节点状态）+ 任务徽标 + 时间线日志。 |

---

## 6. 功能需求：数据管理

| 需求 | 说明 |
|------|------|
| FR-DATA-01 动态列表 | 按所选表单的 Schema 字段出列（最多展示前 4 个业务列 + id/状态）。 |
| FR-DATA-02 筛选 | 记录状态：`submitted` / `archived` / `rejected`；关键词对 `dataJson` 文本模糊匹配（服务端）。 |
| FR-DATA-03 排序 | 表头点击：`status`、业务字段名或默认 `createdAt`，`asc`/`desc`。业务字段按 JSONB 文本排序。 |
| FR-DATA-04 分页 | 默认每页 20，上限 100。 |
| FR-DATA-05 新增 | 弹层动态表单提交，等同填写接口，可触发流程。 |
| FR-DATA-06 编辑 | `PATCH /api/records/{id}` 改 `dataJson`（需 `record:write`）。 |
| FR-DATA-07 删除 | `DELETE`，租户内记录。 |
| FR-DATA-08 详情 | 含表单与关联流程实例、任务、日志。 |
| FR-DATA-09 导出 Excel | `GET /api/forms/{id}/records/export`，xlsx（Open XML），列为 id、status 及全部 Schema 字段。 |
| FR-DATA-10 导入 CSV | 前端解析 CSV 后逐条 `create`（表头需与字段名对应）。 |
| FR-DATA-11 填写页 | `/forms/:id/submit`，仅 `PUBLISHED`；提交文案「提交并启动流程」。 |

记录状态约定：`submitted` 已提交/流转中，`archived` 审批通过归档，`rejected` 已驳回。

---

## 7. 功能需求：权限、用户、插件与任务登记

### 7.1 RBAC

权限码：`user:read/write`、`role:read/write`、`form:read/write`、`workflow:read/write`、`record:read/write`、`plugin:write`、`job:read/write`。

| 需求 | 说明 |
|------|------|
| FR-RBAC-01 | 接口用 `require_permission`；角色码为 `admin` 时全部放行。 |
| FR-RBAC-02 用户 | 列表支持姓名/邮箱关键词；改姓名/部门/岗位/状态；赋角色时角色必须同租户。 |
| FR-RBAC-03 角色 | 列表带权限；创建角色可带权限 id；`PUT /api/roles/{id}/permissions` 覆盖权限集。 |
| FR-RBAC-04 前端按钮 | `usePermission` 控制生成、发布、套模板、用户赋权、插件停用等。 |
| FR-RBAC-05 表单可见性 | 见 4.1 `visibleRoleCodes` + 草稿对无写权限用户隐藏。 |

待办不按 `workflow:write` 拦截，登录用户即可处理指派给自己的任务。

### 7.2 插件中心

| 需求 | 说明 |
|------|------|
| FR-PLG-01 | 种子登记 9 个表单组件 + 6 个流程节点。登录后前端按「已启用」的 `code` 同步运行时注册表；全部停用时仍保留内置。 |
| FR-PLG-02 | 登录用户可列表；`plugin:write` 可登记、改名/配置、启用停用。停用后对应 React 控件不再注册（回退到仍启用的控件）。 |
| FR-PLG-03 | **不会**从数据库动态加载新的 React 实现，仅登记元数据 + 启停已有实现。 |

### 7.3 异步任务表（AsyncJob）

| 需求 | 说明 |
|------|------|
| FR-JOB-01 | `GET/POST /api/jobs`：落库状态 `QUEUED`，**无独立 Worker 消费队列**。需 `job:read` / `job:write`。前端工作台不作为主入口。 |

---

## 8. 功能需求：消息与 WebSocket

| 需求 | 说明 |
|------|------|
| FR-MSG-01 分类 | `TODO` / `DONE` / `CC` / `SYSTEM`。 |
| FR-MSG-02 HTTP | 列表（可按 category，最多 100）、单条已读、全部已读。仅本人数据。 |
| FR-MSG-03 推送时机 | 新待办/抄送、流程通过、驳回、节点超时等写入通知后，向对应用户 WebSocket 推送 `{ type: "notification", data }`。 |
| FR-MSG-04 前端 | 登录后拉历史并连 `ws://当前主机/ws?token=`；断线约 3 秒重连；顶栏铃铛未读数；消息中心筛选与全部已读。 |

---

## 9. 数据需求（表结构）

与 PostgreSQL 表名（PascalCase）及驼峰列名对齐，主要实体：

| 表 | 用途 |
|----|------|
| Tenant | 租户 |
| User | 用户（含 passwordHash、部门岗位、状态） |
| Role / Permission / UserRole / RolePermission | RBAC |
| Form / FormDraft | 表单与按用户草稿 |
| WorkflowTemplate / WorkflowDefinition | 模板与流程定义 |
| FormRecord | 业务数据 JSON |
| WorkflowInstance / WorkflowTask / WorkflowLog | 实例、任务、审计日志 |
| Notification | 站内信 |
| Plugin | 插件元数据 |
| AsyncJob | 任务登记 |

枚举：UserStatus、FormStatus、WorkflowDefStatus、InstanceStatus、TaskType、TaskStatus、NotificationCategory、PluginType、JobStatus。

标识：字符串主键（UUID hex）。JSON 配置存 JSONB。

---

## 10. 接口需求一览

前缀除特别注明外均为 `/api`。除登录/注册/健康检查外需 Bearer Token。

| 方法 | 路径 | 权限要点 |
|------|------|----------|
| GET | `/health`、`/api/health` | 公开 |
| POST | `/auth/login`、`/auth/register` | 公开 |
| GET | `/auth/me` | 登录 |
| GET/PATCH | `/users`、`/users/{id}` | user:read / user:write |
| POST | `/users/{id}/roles` | role:write |
| GET/POST | `/roles`、`/roles/permissions`、`PUT /roles/{id}/permissions` | role:read / role:write |
| POST | `/forms/ai-generate` | form:write |
| GET/POST | `/forms` | form:read / form:write |
| GET/PATCH | `/forms/{id}` | form:read / form:write |
| POST | `/forms/{id}/publish` | form:write |
| PUT | `/forms/{id}/draft` | form:write |
| GET/POST | `/workflows/templates`、`POST .../apply` | 登录 / workflow:write |
| GET/POST/PATCH | `/workflows`、`/workflows/{id}`、`.../publish` | workflow:read / write |
| GET | `/workflows/instances`、`.../instances/{id}` | workflow:read |
| GET/POST | `/tasks/todo`、`/done`、`/{id}/approve`、`/reject` | 登录 |
| GET/POST | `/forms/{id}/records`、`.../export` | record:read / write |
| GET/PATCH/DELETE/POST retry | `/records/{id}` | record:read / write |
| GET/PATCH/POST | `/notifications`、`.../read`、`/read-all` | 登录 |
| GET/POST/PATCH | `/plugins` | 登录 / plugin:write |
| GET/POST | `/jobs` | job:read / write |
| WS | `/ws?token=` | JWT 查询参数 |

---

## 11. 非功能需求（按现状）

| 编号 | 要求 |
|------|------|
| NFR-01 安全 | 密码 bcrypt；JWT 密钥来自环境变量；生产环境 500 不回传异常细节；改用户必须同租户。 |
| NFR-02 隔离 | 业务查询带 `tenantId`。 |
| NFR-03 分页 | 列表 page 从 1，pageSize 限制 1–100。 |
| NFR-04 可用性 | 前端连不上后端时提示启动 3001/5173，避免仅显示 `Failed to fetch`。 |
| NFR-05 开发体验 | 后端 `--reload`；Vite `strictPort: 5173`。 |
| NFR-06 审计 | 流程关键动作写入 WorkflowLog。 |

---

## 12. 明确的范围边界（代码未做或仅部分做）

以下**不要**按「已完成产品」验收：

1. 上传文件不入库、无预览地址；
2. 条件表达式不支持复杂脚本、括号与多字段布尔组合（仅单字段比较）；
3. 超时不会自动驳回整单或跳转指定节点；
4. `rejectRule` 仅为展示/存储，驳回一律结束实例；
5. Redis / Bull 类队列未接入，`AsyncJob` 只落库；
6. 插件不能热加载自定义 JS 组件包；
7. 无独立移动端、无企业微信/钉钉官方集成；
8. 表单字段级数据权限（行级除租户外）未做，列表对有 `record:read` 的角色可见该表全部记录；
9. 大模型依赖外部 Key，默认 `AI_PROVIDER=mock` 走规则。

---

## 13. 典型业务场景（可作验收用例）

**场景 A：模板请假**  
管理员套用「人事 / 员工请假」→ 员工填写 → 经理待办通过 → 记录 `archived`，追踪可见 submit/approve/finish。

**场景 B：AI 报销 + 条件分支**  
管理员用自然语言生成含金额的表并发布；流程为发起 → 条件 →（`amount>100` 管理员审批，否则经理审批）→ 结束。低额进经理待办，高额进管理员待办。

**场景 C：对话微调**  
已有表上提示「增加加班类型」，Schema 出现 `overtimeType` 且仍为同一 `formId`。

**场景 D：驳回重提**  
经理驳回 → 记录 `rejected` → 创建人 retry → 新实例再流转。

---

## 14. 文档关系

| 文档 | 用途 |
|------|------|
| 本说明书 | 与代码一致的需求基线 |
| `AI低代码表单生成与工作流引擎-产品需求文档(PRD) (1).md` | 早期产品愿景，部分条目已超出或弱于现状 |
| `零代码应用搭建平台-客户使用手册.md` | 业务操作说明 |
| `小白入门使用说明.md` | 逐步操作示例 |

需求变更应以本说明书与仓库实现同步更新。
