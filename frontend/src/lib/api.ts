/**
 * 统一请求入口。页面只调 xxxApi.list()，不要自己 fetch。
 * BASE 为空时走 Vite 代理到后端 8002。
 */
import type { ApiResult, AuthUser, FormEntity, Paginated, PluginEntity, WorkflowEntity } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      "无法连接服务器。请先启动后端（端口 8002）和前端（npm run dev，端口 5175），然后刷新页面再登录。",
    );
  }
  const json = (await res.json().catch(() => ({}))) as ApiResult<T> & { message?: string };
  if (!res.ok || json.success === false) {
    // 登录接口本身失败不要清 token，否则会把刚输入的会话冲掉
    if (res.status === 401 && !path.includes("/api/auth/login")) {
      useAuthStore.getState().logout();
    }
    throw new ApiError(res.status, json.message ?? "请求失败");
  }
  return json.data;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: { id: string; email: string; name: string; tenantId: string; roles: string[] } }>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password, tenantSlug: "demo" }) },
    ),
  register: (email: string, password: string, name: string) =>
    api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name, tenantSlug: "demo" }) }),
  me: () => api<AuthUser>("/api/auth/me"),
};

export const formApi = {
  list: (page = 1) => api<Paginated<FormEntity>>(`/api/forms?page=${page}&pageSize=50`),
  get: (id: string) => api<FormEntity & { drafts?: { contentJson: unknown }[] }>(`/api/forms/${id}`),
  create: (body: Partial<FormEntity> & { name: string }) =>
    api<FormEntity>("/api/forms", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api<FormEntity>(`/api/forms/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  aiGenerate: (prompt: string, formId?: string) =>
    api<{ form: FormEntity; generated?: { layoutTip?: string } }>("/api/forms/ai-generate", {
      method: "POST",
      body: JSON.stringify({ prompt, formId }),
    }),
  publish: (id: string) => api<FormEntity>(`/api/forms/${id}/publish`, { method: "POST" }),
  saveDraft: (id: string, contentJson: unknown) =>
    api(`/api/forms/${id}/draft`, { method: "PUT", body: JSON.stringify({ contentJson }) }),
};

export const workflowApi = {
  list: () => api<Paginated<WorkflowEntity>>("/api/workflows"),
  get: (id: string) => api<WorkflowEntity>(`/api/workflows/${id}`),
  create: (body: { name: string; formId?: string; definitionJson: WorkflowEntity["definitionJson"] }) =>
    api<WorkflowEntity>("/api/workflows", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api<WorkflowEntity>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  publish: (id: string) => api<WorkflowEntity>(`/api/workflows/${id}/publish`, { method: "POST" }),
  templates: () =>
    api<{ id: string; name: string; category: string; description?: string }[]>("/api/workflows/templates"),
  saveTemplate: (body: Record<string, unknown>) =>
    api("/api/workflows/templates", { method: "POST", body: JSON.stringify(body) }),
  applyTemplate: (id: string) =>
    api<{ form: { id: string }; workflow: { id: string } }>(`/api/workflows/templates/${id}/apply`, { method: "POST" }),
  instances: () => api<Record<string, unknown>[]>("/api/workflows/instances"),
  instance: (id: string) => api<Record<string, unknown>>(`/api/workflows/instances/${id}`),
};

export const recordApi = {
  list: (formId: string, page = 1, status = "", extra: { keyword?: string; sort?: string; order?: string } = {}) => {
    const q = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      status,
      keyword: extra.keyword ?? "",
      sort: extra.sort ?? "",
      order: extra.order ?? "desc",
    });
    return api<Paginated<Record<string, unknown>>>(`/api/forms/${formId}/records?${q.toString()}`);
  },
  exportExcel: async (formId: string) => {
    const token = useAuthStore.getState().token;
    const res = await fetch(`${BASE}/api/forms/${formId}/records/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "导出失败");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "records.xlsx";
    a.click();
  },
  create: (formId: string, dataJson: Record<string, unknown>) =>
    api<{ record: Record<string, unknown>; instance: Record<string, unknown> | null }>(`/api/forms/${formId}/records`, {
      method: "POST",
      body: JSON.stringify({ dataJson }),
    }),
  get: (id: string) => api<Record<string, unknown>>(`/api/records/${id}`),
  update: (id: string, dataJson: Record<string, unknown>) =>
    api(`/api/records/${id}`, { method: "PATCH", body: JSON.stringify({ dataJson }) }),
  remove: (id: string) => api(`/api/records/${id}`, { method: "DELETE" }),
  retry: (id: string, dataJson: Record<string, unknown>) =>
    api(`/api/records/${id}/retry`, { method: "POST", body: JSON.stringify({ dataJson }) }),
};

export const taskApi = {
  todo: () => api<Record<string, unknown>[]>("/api/tasks/todo"),
  done: () => api<Record<string, unknown>[]>("/api/tasks/done"),
  approve: (id: string, comment?: string) =>
    api(`/api/tasks/${id}/approve`, { method: "POST", body: JSON.stringify({ comment }) }),
  reject: (id: string, comment?: string) =>
    api(`/api/tasks/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
};

export const userApi = {
  list: (keyword = "") => api<Paginated<Record<string, unknown>>>(`/api/users?keyword=${encodeURIComponent(keyword)}`),
  update: (id: string, body: Record<string, unknown>) =>
    api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  setRoles: (id: string, roleIds: string[]) =>
    api(`/api/users/${id}/roles`, { method: "POST", body: JSON.stringify({ roleIds }) }),
};

export const roleApi = {
  list: () => api<Record<string, unknown>[]>("/api/roles"),
  permissions: () => api<{ id: string; code: string; name: string }[]>("/api/roles/permissions"),
  create: (body: Record<string, unknown>) => api("/api/roles", { method: "POST", body: JSON.stringify(body) }),
  setPermissions: (id: string, permissionIds: string[]) =>
    api(`/api/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissionIds }) }),
};

export const pluginApi = {
  list: () => api<PluginEntity[]>("/api/plugins"),
  create: (body: Record<string, unknown>) => api("/api/plugins", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    api(`/api/plugins/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

export const notificationApi = {
  list: (category?: string) =>
    api<{ id: string; title: string; content: string; isRead: boolean; category: string; createdAt: string }[]>(
      `/api/notifications${category ? `?category=${category}` : ""}`,
    ),
  read: (id: string) => api(`/api/notifications/${id}/read`, { method: "PATCH" }),
  readAll: () => api("/api/notifications/read-all", { method: "POST" }),
};

export const jobApi = {
  list: () => api<Record<string, unknown>[]>("/api/jobs"),
  create: (type: string, payloadJson: unknown = {}) =>
    api("/api/jobs", { method: "POST", body: JSON.stringify({ type, payloadJson }) }),
};
