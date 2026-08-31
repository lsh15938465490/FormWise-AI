import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/modal";
import { workflowApi } from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import type { WorkflowEntity } from "@/types/api";

export function WorkflowListPage() {
  const { can } = usePermission();
  const [items, setItems] = useState<WorkflowEntity[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; category: string }[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const [list, tpls] = await Promise.all([workflowApi.list(), workflowApi.templates()]);
    setItems(list.items);
    setTemplates(tpls);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">工作流</h1>
        <div className="flex gap-2">
          <Link to="/workflows/trace">
            <Button variant="outline">流程追踪</Button>
          </Link>
          <Link to="/workflows/designer">
            <Button>打开编排画布</Button>
          </Link>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card>
        <h2 className="mb-3 font-medium">流程模板库</h2>
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              disabled={!can("workflow:write")}
              onClick={async () => {
                await workflowApi.applyTemplate(t.id);
                await load();
              }}
            >
              {t.category} / {t.name}
            </Button>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2">
                  <Badge>{item.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link className="text-primary" to={`/workflows/designer?id=${item.id}`}>
                    编排
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
