import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formApi, pluginApi, taskApi, workflowApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export function DashboardPage() {
  const isAdmin = useAuthStore((s) => s.user?.roles.includes("admin"));
  const [stats, setStats] = useState({ forms: 0, workflows: 0, todos: 0, plugins: 0, instances: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      formApi.list(),
      workflowApi.list(),
      taskApi.todo(),
      pluginApi.list(),
      workflowApi.instances().catch(() => []),
    ])
      .then(([forms, workflows, todos, plugins, instances]) => {
        setStats({
          forms: forms.total,
          workflows: workflows.total,
          todos: todos.length,
          plugins: plugins.length,
          instances: instances.length,
        });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const cards = [
    { label: "表单", value: stats.forms, to: "/forms" },
    { label: "审批流程", value: stats.workflows, to: "/workflows" },
    { label: "办理中申请", value: stats.instances, to: "/workflows/trace" },
    { label: "待办", value: stats.todos, to: "/tasks" },
    ...(isAdmin ? [{ label: "控件扩展", value: stats.plugins, to: "/admin/plugins" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <p className="text-sm text-muted-foreground">填写申请、跟进审批、查看业务数据</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className={`grid gap-4 ${isAdmin ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card>
              <div className="text-sm text-muted-foreground">{c.label}</div>
              <div className="mt-2 text-3xl font-semibold">{c.value}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
