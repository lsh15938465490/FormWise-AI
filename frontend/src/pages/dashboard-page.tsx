import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { formApi, pluginApi, taskApi, workflowApi } from "@/lib/api";

export function DashboardPage() {
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
    { label: "工作流", value: stats.workflows, to: "/workflows" },
    { label: "流程实例", value: stats.instances, to: "/workflows/trace" },
    { label: "待办", value: stats.todos, to: "/tasks" },
    { label: "插件", value: stats.plugins, to: "/admin/plugins" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">工作台</h1>
        <p className="text-sm text-muted-foreground">自然语言生成表单 → 可视化流程 → 提交审批 → 数据归档</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-5">
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
