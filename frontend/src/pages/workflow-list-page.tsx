import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/modal";
import { workflowApi } from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import type { WorkflowEntity } from "@/types/api";
import { WORKFLOW_STATUS, labelOf } from "@/lib/labels";

export function WorkflowListPage() {
  const { can } = usePermission();
  const [items, setItems] = useState<WorkflowEntity[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string; category: string }[]>([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  async function load() {
    const [list, tpls] = await Promise.all([workflowApi.list(), workflowApi.templates()]);
    setItems(list.items);
    setTemplates(tpls);
  }

  async function removeWorkflow(item: WorkflowEntity) {
    if (!window.confirm(`确定删除「${item.name}」？相关流程实例也会一并删除。`)) return;
    setDeletingId(item.id);
    setError("");
    try {
      await workflowApi.remove(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId("");
    }
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-semibold">审批流程</h1>
        <div className="flex gap-2">
          <Link to="/workflows/trace">
            <Button variant="outline">办理进度</Button>
          </Link>
          <Link to="/workflows/designer">
            <Button>设计流程</Button>
          </Link>
        </div>
      </div>
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
      <Card className="shrink-0">
        <h2 className="mb-3 font-medium">常用模板</h2>
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
      <Card className="min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left">
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
                  <Badge>{labelOf(WORKFLOW_STATUS, item.status)}</Badge>
                </td>
                <td className="space-x-3 px-4 py-2 text-right">
                  <Link className="text-primary" to={`/workflows/designer?id=${item.id}`}>
                    编辑
                  </Link>
                  {can("workflow:write") ? (
                    <button
                      type="button"
                      className="text-destructive disabled:opacity-50"
                      disabled={deletingId === item.id}
                      onClick={() => removeWorkflow(item)}
                    >
                      {deletingId === item.id ? "删除中" : "删除"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
