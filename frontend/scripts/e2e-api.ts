const BASE = process.env.API_BASE ?? "http://localhost:3001";

async function api(path: string, token?: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(`${init.method ?? "GET"} ${path} ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

async function main() {
  const admin = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email: "admin@formwise.local", password: "Admin123!", tenantSlug: "demo" }),
  });
  const manager = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email: "manager@formwise.local", password: "Admin123!", tenantSlug: "demo" }),
  });
  const employee = await api("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email: "employee@formwise.local", password: "Admin123!", tenantSlug: "demo" }),
  });

  const me = await api("/api/auth/me", admin.token);
  const generated = await api("/api/forms/ai-generate", admin.token, {
    method: "POST",
    body: JSON.stringify({
      prompt: "搭建员工请假审批表，包含姓名、部门、岗位、请假类型、请假时长、请假原因",
    }),
  });
  const formId = generated.form.id as string;
  await api(`/api/forms/${formId}`, admin.token, {
    method: "PATCH",
    body: JSON.stringify({ name: generated.form.name, description: "e2e" }),
  });
  await api(`/api/forms/${formId}/draft`, admin.token, {
    method: "PUT",
    body: JSON.stringify({ contentJson: { note: "draft" } }),
  });
  await api(`/api/forms/${formId}/publish`, admin.token, { method: "POST" });

  const tpls = await api("/api/workflows/templates", admin.token);
  const applied = await api(`/api/workflows/templates/${tpls[0].id}/apply`, admin.token, { method: "POST" });
  const wf = await api(`/api/workflows/${applied.workflow.id}`, admin.token);
  await api(`/api/workflows/${applied.workflow.id}`, admin.token, {
    method: "PATCH",
    body: JSON.stringify({ name: wf.name, definitionJson: wf.definitionJson, formId: applied.form.id }),
  });

  const submitted = await api(`/api/forms/${applied.form.id}/records`, employee.token, {
    method: "POST",
    body: JSON.stringify({
      dataJson: { name: "李员工", department: "rd", leaveType: "annual", duration: 1, reason: "联调测试" },
    }),
  });
  const todos = await api("/api/tasks/todo", manager.token);
  const task = todos[0];
  if (!task) throw new Error("经理没有待办，流程未打通");
  await api(`/api/tasks/${task.id}/approve`, manager.token, {
    method: "POST",
    body: JSON.stringify({ comment: "联调通过" }),
  });

  const records = await api(`/api/forms/${applied.form.id}/records`, admin.token);
  const users = await api("/api/users", admin.token);
  const roles = await api("/api/roles", admin.token);
  const plugins = await api("/api/plugins", admin.token);
  const notes = await api("/api/notifications", manager.token);

  const result = {
    me: me.email,
    formId,
    appliedFormId: applied.form.id,
    recordId: submitted.record.id,
    instanceStatus: submitted.instance?.status,
    managerTodosBeforeApprove: todos.length,
    records: records.total,
    users: users.total,
    roles: roles.length,
    plugins: plugins.length,
    managerNotifications: notes.length,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
