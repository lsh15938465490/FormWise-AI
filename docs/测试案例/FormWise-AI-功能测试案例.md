# FormWise-AI 功能测试案例

| 项 | 内容 |
|----|------|
| 依据文档 | `需求文档/FormWise-AI-功能需求说明书.md`（2026-09-11） |
| 环境 | 前端 `http://localhost:5175`，后端 `http://127.0.0.1:8002`，租户 `demo` |
| 账号 | 管理员 `admin` / `Admin123!`；经理 `manager@formwise.local`；员工 `employee@formwise.local` |
| 执行方式 | 本文为手工+接口双轨；自动化脚本 `测试案例/run_functional_cases.py` |
| 结果判定 | PASS / FAIL / SKIP；FAIL 须修代码后回归 |

**测试角度约定（每条尽量覆盖）**

- 正向：主路径成功
- 反向：错误凭证、无权限、资源不存在
- 边界：空串、最短密码、未发布表单、无绑定流程、超时任务、无选项下拉
- 角色：admin / manager / employee 差异
- 数据隔离：按表单、按租户、按指派人
- 界面：滚动、弹窗按钮、校验红字、待办可见性

---

## A. 认证与会话

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| A01 | 健康检查 | 后端启动 | GET `/health`、`/api/health` | success | 数据库宕机时 `/api/health` 失败 |
| A02 | 管理员邮箱登录 | 种子用户 | POST login email=admin@formwise.local | 200 + token + roles 含 admin | — |
| A03 | 别名 admin 登录 | 同上 | email=`admin` | 与 A02 同等会话 | 大小写 `Admin` 亦映射 |
| A04 | 错误密码 | — | 密码 `wrong12` | 401 邮箱或密码错误 | 空密码、少于 6 位 400 |
| A05 | 不存在租户 | — | tenantSlug=`no-such` | 404 租户不存在 | — |
| A06 | 无 Token 访问 | 未登录 | GET `/api/auth/me` | 401 未登录 | 乱码 Bearer 401 |
| A07 | me 成功 | 已登录 | GET `/api/auth/me` | 含 permissions | — |
| A08 | 注册新用户 | 未占用邮箱 | register | 201，默认 employee | 重复邮箱 409 |
| A09 | 登录页 UI | 打开 5175/login | 默认账号 admin；提交进工作台 | 侧栏出现；错误密码页内红字 | 直接打开 `/forms` 应跳转登录 |

---

## B. 权限与用户

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| B01 | 员工不能创建表单 | employee token | POST `/api/forms` | 403 | GET 已发布表单 200 |
| B02 | 经理不能删流程 | manager | DELETE workflow | 403 | GET 列表 200 |
| B03 | 管理员改用户状态 | admin | PATCH 禁用再登录 | 登录 403 账号已禁用 | 再启用可登录 |
| B04 | 角色列表 | admin | GET `/api/roles` | 含 admin/manager/employee | 员工 403 |

---

## C. 表单引擎

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| C01 | 表单分页列表 | admin | GET `/api/forms?page=1&pageSize=100` | items+total | pageSize 超大仍分页 |
| C02 | 手工创建草稿 | form:write | POST 名称 | 草稿 | 空名称 400 |
| C03 | 保存 schema 并发布 | C02 | PUT draft 含 Input；POST publish | status published | 无 schema 发布应失败 |
| C04 | 未发布不可填报 | 草稿表单 | POST records | 404 已发布表单不存在 | — |
| C05 | AI 生成 | 配置可用则跑 | POST ai-generate 提示「加班申请含部门和加班类型」 | 生成 Select 且有 options | AI 失败有 message |
| C06 | 选项补全-部门 | 读任意含部门 Select 的表单 | GET form | options 非空（人事/财务等） | 无 keyword 则选项一/二/三 |
| C07 | 列表页滚动 | UI | 表单很多时 | 仅右侧表格滚动，侧栏固定，表头 sticky | 窗口缩小不出现 html 双滚动 |
| C08 | 设计器保存 | UI | 拖字段、设必填、保存 | 再进设计器数据还在 | 长文本与短字段不并排撑空白 |

---

## D. 记录与流程启动（核心）

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| D01 | 提交已绑定流程表单 | 已发布+已发布流程 | POST records | record + instance 非空，tasks PENDING | 空 body 400 |
| D02 | 提交无绑定流程表单 | 仅发布表单 | POST records | 自动创建「{表单名}流程」并启动；instance 非空 | 重复提交产生多实例 |
| D03 | 校验失败不提交 | UI 必填空 | 点提交 | 按钮上方错误；滚到首条；无新记录 | 仅填部分字段 |
| D04 | 下拉可选手 | 加班/请假 | 打开填报弹窗 | Select 有选项，可选后提交成功 | 选项 value 写入 dataJson |
| D05 | 列表按表单隔离 | 两张表单各有记录 | 切换下拉 | 只显示当前表单 | 同名表单带时间可区分 |
| D06 | 记住上次表单 | D05 | 刷新数据页 | sessionStorage 恢复 formId | 清除 storage 回默认 |
| D07 | 导出 Excel | 有记录 | GET export | xlsx 非空 | 无记录仍有表头 |
| D08 | 删除记录 | record:write | DELETE | 再 GET 404 | 无权限 403 |
| D09 | 弹窗按钮固定 | UI | 字段很多 | 底栏提交始终可见 | — |

---

## E. 待办审批

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| E01 | 经理看到自己的待办 | D01/D02 派 manager | manager GET todo | 含新任务 | employee 不应看到经理单 |
| E02 | 管理员看到租户待办 | 任务派给经理 | admin GET todo | 仍能看到（含 TIMEOUT） | 非 admin 不可看他人 |
| E03 | 经理通过 | E01 | POST approve | 推进到结束或下一节点；记录 archived（单级流） | 重复 approve 400 |
| E04 | 管理员代审 | E02 | admin approve 经理的任务 | 200 流程继续 | 跨租户 403 |
| E05 | 驳回 | 新实例 | reject + 意见 | 实例 REJECTED，记录 rejected，发起人有通知 | 空意见允许 |
| E06 | 驳回重提 | E05 | POST retry 新数据 | 新 instance IN_PROGRESS | 非本人 404 |
| E07 | 超时仍可审 | 将 dueAt 置过去或等扫描 | todo 含 TIMEOUT；approve | 成功 | 扫描后不能从待办「消失且无法处理」 |
| E08 | 已办列表 | 通过后 | GET done | 出现该任务 | 上限 50 |

---

## F. 工作流设计与删除

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| F01 | 创建并发布自定义流 | admin | 节点 start-approve-end，绑定表单 | 填报走该流而非重复新建冲突 | 缺 start 启动 400 |
| F02 | 条件边 | 请假天数>3 走经理 | 提交 days=5 / days=1 | 分别命中对应边 | 条件非法走默认边 |
| F03 | 删除流程 | 测试流程 | DELETE | 列表消失；实例任务级联 | 再 GET 404 |
| F04 | 画布删节点/连线 | UI | 选中删除键 | 保存后不再出现 | 删 start 后发布/启动失败有提示 |
| F05 | 四边连线与双击改名 | UI | 从右侧 handle 连到下一节点；双击改名保存 | definition 含 handle 与新 name | — |
| F06 | 角色中文下拉 | UI | 打开审批节点 | 见企业管理员/部门经理/员工 | 存英文 code |

---

## G. 消息、插件、布局回归

| 编号 | 标题 | 前置 | 步骤 | 期望 | 边界 |
|------|------|------|------|------|------|
| G01 | 提交后通知审批人 | D01 | GET notifications（经理） | 有「待处理」 | WS 连接时铃铛+1 |
| G02 | 标已读 | G01 | PATCH read / read-all | unread 降 | 重复已读幂等 |
| G03 | 插件列表 | admin | GET plugins | 可切换 enabled | 员工只读或 403（按实现） |
| G04 | 全局布局 | 各业务页 | 左右结构 | 侧栏不跟内容滚 | 待办/消息/用户页同样 |

---

## H. 多角色交叉矩阵（必测）

| 场景 | admin | manager | employee |
|------|-------|---------|----------|
| 登录别名 | admin 可以 | 须邮箱 | 须邮箱 |
| 建表单/发流程 | 是 | 否 | 否 |
| 填报已发布可见表单 | 是 | 是 | 是 |
| 待办范围 | 租户全部待处理 | 仅自己 | 仅自己 |
| 代审他人 | 是 | 否 | 否 |
| 用户管理 | 是 | 否 | 否 |

---

## I. 缺陷处理约定

1. 自动化 FAIL 先改后端契约，再改前端展示。
2. 界面 FAIL（滚动、无选项、待办空）当场改代码并复测同编号。
3. 测试完成后输出：通过数、失败数、已修问题列表。
