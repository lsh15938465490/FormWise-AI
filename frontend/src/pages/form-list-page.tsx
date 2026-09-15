import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/modal";
import { formApi } from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";
import type { FormEntity } from "@/types/api";
import { FORM_STATUS, labelOf } from "@/lib/labels";

export function FormListPage() {
  const { can } = usePermission();
  const [items, setItems] = useState<FormEntity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    formApi
      .list()
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-semibold">表单</h1>
        {can("form:write") ? (
          <Link to="/forms/builder">
            <Button>新建表单</Button>
          </Link>
        ) : null}
      </div>
      {error ? <p className="shrink-0 text-sm text-destructive">{error}</p> : null}
      <Card className="min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left">
            <tr>
              <th className="px-4 py-2">名称</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">更新时间</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2">
                  <Badge>{labelOf(FORM_STATUS, item.status)}</Badge>
                </td>
                <td className="px-4 py-2">{new Date(item.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-right space-x-3">
                  {can("form:write") ? (
                    <Link className="text-primary" to={`/forms/builder?id=${item.id}`}>
                      编辑
                    </Link>
                  ) : null}
                  {item.status === "PUBLISHED" ? (
                    <Link className="text-primary" to={`/forms/${item.id}/submit`}>
                      填写
                    </Link>
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
