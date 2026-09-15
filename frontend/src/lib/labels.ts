/** 界面展示用中文，接口仍用英文枚举。 */

export const FORM_STATUS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ARCHIVED: "已停用",
};

export const WORKFLOW_STATUS = FORM_STATUS;

export const RECORD_STATUS: Record<string, string> = {
  submitted: "审批中",
  archived: "已通过",
  rejected: "已驳回",
};

export const INSTANCE_STATUS: Record<string, string> = {
  PENDING: "待开始",
  IN_PROGRESS: "进行中",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  TIMEOUT: "已超时",
  TERMINATED: "已终止",
};

export const TASK_STATUS: Record<string, string> = {
  PENDING: "待处理",
  IN_PROGRESS: "处理中",
  APPROVED: "已同意",
  REJECTED: "已驳回",
  CANCELLED: "已取消",
  TIMEOUT: "已超时",
};

export const USER_STATUS: Record<string, string> = {
  ACTIVE: "正常",
  DISABLED: "已停用",
};

export const NOTICE_CATEGORY: Record<string, string> = {
  ALL: "全部",
  TODO: "待办",
  DONE: "办结",
  CC: "抄送",
  SYSTEM: "系统",
};

export const PLUGIN_TYPE: Record<string, string> = {
  FORM_COMPONENT: "表单控件",
  WORKFLOW_NODE: "流程节点",
};

export const FLOW_ACTION: Record<string, string> = {
  submit: "提交",
  approve: "同意",
  reject: "驳回",
  timeout: "超时",
  finish: "结束",
  condition: "条件判断",
  cc: "抄送",
  notify: "通知",
};

export const NODE_TYPE: Record<string, string> = {
  start: "发起",
  approve: "审批",
  condition: "条件",
  cc: "抄送",
  notify: "通知",
  end: "结束",
};

export function labelOf(map: Record<string, string>, value?: string | null, fallback = "—") {
  if (!value) return fallback;
  return map[value] ?? map[value.toUpperCase()] ?? map[value.toLowerCase()] ?? value;
}
