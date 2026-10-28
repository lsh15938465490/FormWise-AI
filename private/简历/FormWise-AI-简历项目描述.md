# FormWise-AI · 简历用项目描述

面向「把本仓库写进简历」整理，描述与**当前代码已实现能力**对齐，避免写成未落地的产品愿景。可按目标岗位删减，不要整段照抄超过一页。

| 项 | 建议写法 |
|----|----------|
| 项目名称 | FormWise-AI（企业内部 AI 零代码表单与工作流平台） |
| 角色（按实际改） | 全栈开发 / 后端开发 / 前端开发 |
| 周期（按实际改） | 独立完成 / 核心开发（补充起止年月） |
| 适用岗位 | 全栈、Java/Python 后端、React 前端、低代码/B 端、工作流相关 |

---

## 1. 一句话（放在项目标题下）

独立设计并实现企业内部零代码业务平台：自然语言生成动态表单，可视化编排审批流，提交后自动入库、分流审批、站内通知与数据导出；前后端分离，多租户 + RBAC。

---

## 2. 技术栈（技能栏可摘）

**后端：** Python、FastAPI、SQLAlchemy 2、PostgreSQL、Pydantic、JWT、bcrypt、WebSocket、Docker  

**前端：** React 18、TypeScript、Vite、React Router、Zustand、React Hook Form、Zod、Tailwind CSS、React Flow  

**工程：** 统一 `{ success, message, data }` 接口约定、Vite 反向代理、Excel 导出、按需求文档与测试用例做接口级功能验收  

---

## 3. 可直接粘贴的项目经历

### 3.1 标准版（推荐，4～6 条）

**FormWise-AI | 企业内部 AI 零代码表单 + 工作流平台 | 全栈**

- 面向请假、报销等企业内部流程，实现「自然语言出表 → 可视化审批流 → 填报入库 → 待办审批 → 数据归档」闭环。
- 后端基于 FastAPI + SQLAlchemy + PostgreSQL：多租户隔离、JWT 鉴权、角色权限码（RBAC）、统一响应与分页；表单/流程/记录/待办/消息等 REST 接口。
- AI 表单：中文提示词规则解析生成 JSON Schema、布局与字段联动（如部门→岗位选项过滤）；支持同一表单多轮对话微调（增删字段、设必填）；草稿/发布分离，按角色控制可见与填写。
- 工作流引擎：节点图（开始/条件/审批/结束）执行、条件边按表单字段分流、角色派发待办、通过/驳回/重提、超时标记任务、实例日志；前端 React Flow 设计与只读追踪着色。
- 动态表单引擎：JSON Schema 驱动渲染，Zod 运行时校验，插件化控件注册；数据列表支持关键词/状态筛选、字段排序、Excel 导出。
- 站内消息 + WebSocket 推送待办；对照测试用例完成接口功能验收（核心路径通过）。

### 3.2 精简版（空间不够时用 3 条）

- 独立完成 AI 零代码表单与审批工作流平台（React + FastAPI + PostgreSQL），覆盖生成、填报、审批、通知、导出全链路。
- 实现多租户、JWT + RBAC、JSON Schema 动态表单、条件分支工作流引擎及 WebSocket 消息推送。
- 表单配置支持自然语言生成与对话微调；数据层支持筛选排序与 Excel 导出。

### 3.3 偏后端

- 用 FastAPI 重建业务后端，REST + WebSocket，SQLAlchemy 映射业务表，PostgreSQL 多租户查询一律带 `tenantId`。
- 自研轻量工作流引擎：解析节点/边定义，条件表达式分流，审批任务按角色派发，驳回后允许发起人改数重提；定时扫描任务超时（不误关整单）。
- 认证：bcrypt 密码、JWT（userId/tenantId）；权限依赖注入（`form:write` 等）；统一异常与校验错误响应。
- 记录模块：JSONB 模糊检索、动态排序、分页钳制、xlsx 导出；未发布表单禁止提交。

### 3.4 偏前端

- React 18 + TypeScript + Vite 搭建管理端：工作台、表单设计/填写、流程设计/追踪、数据、待办、消息、用户与插件。
- 表单设计器：提示词生成、字段画布、属性编辑、防抖草稿保存、Schema→Zod 校验、TypeScript 类型预览。
- 动态渲染：控件注册表 + 布局分组；部门岗位等 `filter-options` 联动；路由守卫与按权限显隐按钮。
- 流程页用 React Flow 编排节点；追踪页只读着色；WebSocket 更新未读与待办。

---

## 4. 面试时建议主动讲的 3 个点

1. **配置与运行时分离：** 表单不是写死页面，而是 Schema + 布局 + 联动 JSON；提交走同一套引擎和校验，和低代码产品形态一致。  
2. **工作流不是“画了就算”：** 条件边命中则只走命中分支，否则走无条件默认边；条件节点不产生待办，直接往下走。  
3. **权限分层：** 列表对无写权限用户隐藏草稿；详情与提交接口也拒绝未发布表单；`visibleRoleCodes` 控制谁能看见已发布表。

---

## 5. 量化与成果（有数据再填，没有就别编）

可如实写的方向（数字请按你真实投入改）：

- 模块：认证、表单引擎、工作流、数据、RBAC、插件登记、异步任务登记、消息/WS 等。
- 内置流程模板：请假、报销、采购、加班、出差等可一键套用。
- 对照 Excel 测试用例做接口回归：核心用例通过（详见仓库 `测试案例/测试执行报告.md`）。

不建议写「日活/万级并发」等本项目未验证的指标。

---

## 6. 不要写进简历的内容（避免面试被追问穿帮）

| 容易夸大 | 实际情况 |
|----------|----------|
| 「对接 GPT/大模型生成表单」 | 默认 mock 关键词规则；可接 LLM，但演示环境通常不走外网 Key |
| 「完整 BPMN / 复杂表达式引擎」 | 条件为字段比较式（如 `amount>100`），复杂表达式未做 |
| 「文件上传中台」 | 上传控件目前偏文件名，不入库真实文件 |
| 「插件热加载自定义 React 组件」 | 插件中心可登记启停，运行时仍是前端内置控件 |
| 「超时自动驳回整单」 | 超时只把任务标 TIMEOUT，不结束整单 |
| 「CSV 导入、异步 Job Worker」 | 导入/后台 Worker 未作为主路径落地 |

---

## 7. 技能关键词（ATS / 招聘筛选）

`React` `TypeScript` `Vite` `Zustand` `Zod` `FastAPI` `Python` `PostgreSQL` `SQLAlchemy` `JWT` `RBAC` `WebSocket` `JSON Schema` `低代码` `工作流引擎` `React Flow` `多租户` `REST API`

---

## 8. 英文短描述（投外企或中英简历时用）

Built FormWise-AI, an internal no-code form and workflow platform. Natural-language prompts generate JSON Schema forms with layout and field linkage; a lightweight engine runs approval graphs with conditional branching, role-based tasks, reject-and-resubmit, and in-app WebSocket notifications. Stack: React 18 / TypeScript / FastAPI / PostgreSQL, multi-tenant RBAC, and Excel export.

---

使用建议：校招/实习用 **3.1 标准版**；社招后端用 **3.3**；前端岗用 **3.4**。项目名称保持「FormWise-AI」，职责里写清是独立完成还是团队中的哪一层。
