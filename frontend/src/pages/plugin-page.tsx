import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { pluginApi } from "@/lib/api";
import { syncEnabledPlugins } from "@/plugins/registry";
import { usePermission } from "@/hooks/use-permission";
import type { PluginEntity } from "@/types/api";
import { PLUGIN_TYPE, labelOf } from "@/lib/labels";

export function PluginPage() {
  const { can } = usePermission();
  const [items, setItems] = useState<PluginEntity[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"FORM_COMPONENT" | "WORKFLOW_NODE">("FORM_COMPONENT");

  async function load() {
    setItems(await pluginApi.list());
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">控件扩展</h1>
      <Card>
        <p className="text-sm text-muted-foreground">启用或停用表单控件与流程节点，供设计表单和流程时使用。</p>
      </Card>
      {can("plugin:write") ? (
        <Card className="flex flex-wrap items-end gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="FORM_COMPONENT">表单控件</option>
            <option value="WORKFLOW_NODE">流程节点</option>
          </Select>
          <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} placeholder="显示名称" />
          <Input className="w-40" value={code} onChange={(e) => setCode(e.target.value)} placeholder="内部编码" />
          <Button
            onClick={async () => {
              if (!name.trim() || !code.trim()) return;
              await pluginApi.create({ type, code: code.trim(), name: name.trim(), configJson: {} });
              setName("");
              setCode("");
              await load();
            }}
          >
            添加
          </Button>
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{labelOf(PLUGIN_TYPE, p.type)}</div>
              <div className="font-medium">{p.name}</div>
            </div>
            {can("plugin:write") ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await pluginApi.update(p.id, { enabled: !p.enabled });
                  await load();
                  const latest = await pluginApi.list();
                  syncEnabledPlugins(latest.filter((x) => x.enabled).map((x) => x.code));
                }}
              >
                {p.enabled ? "停用" : "启用"}
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
