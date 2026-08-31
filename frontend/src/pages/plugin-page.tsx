import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { pluginApi } from "@/lib/api";
import { getRegistrySnapshot, syncEnabledPlugins } from "@/plugins/registry";
import { usePermission } from "@/hooks/use-permission";
import type { PluginEntity } from "@/types/api";

export function PluginPage() {
  const { can } = usePermission();
  const [items, setItems] = useState<PluginEntity[]>([]);
  const local = getRegistrySnapshot();
  const [code, setCode] = useState("CustomInput");
  const [name, setName] = useState("自定义输入");
  const [type, setType] = useState<"FORM_COMPONENT" | "WORKFLOW_NODE">("FORM_COMPONENT");

  async function load() {
    setItems(await pluginApi.list());
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">插件注册中心</h1>
      <Card>
        <p className="text-sm text-muted-foreground">
          前端运行时组件：{local.formWidgets.join(", ")}；流程节点：{local.workflowNodes.join(", ")}
        </p>
      </Card>
      {can("plugin:write") ? (
        <Card className="flex flex-wrap items-end gap-2">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="FORM_COMPONENT">FORM_COMPONENT</option>
            <option value="WORKFLOW_NODE">WORKFLOW_NODE</option>
          </Select>
          <Input className="w-40" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            onClick={async () => {
              await pluginApi.create({ type, code, name, configJson: {} });
              await load();
            }}
          >
            注册插件
          </Button>
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{p.type}</div>
              <div className="font-medium">{p.name}</div>
              <div className="text-sm">{p.code}</div>
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
