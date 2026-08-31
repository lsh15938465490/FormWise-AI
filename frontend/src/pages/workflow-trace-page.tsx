import { useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/modal";
import { workflowApi } from "@/lib/api";

type Log = { id: string; action: string; comment?: string; nodeName?: string; createdAt: string };
type Task = { nodeId?: string; nodeName: string; status: string };
type Instance = {
  id: string;
  status: string;
  currentNodeIds?: string[];
  workflow?: {
    name?: string;
    definitionJson?: { nodes: { id: string; type: string; name: string; x?: number; y?: number }[]; edges: { source: string; target: string; condition?: string }[] };
  };
  logs?: Log[];
  tasks?: Task[];
};

function nodeColor(status?: string) {
  if (status === "APPROVED") return "#16a34a";
  if (status === "REJECTED") return "#dc2626";
  if (status === "TIMEOUT") return "#ea580c";
  if (status === "PENDING" || status === "IN_PROGRESS") return "#2563eb";
  if (status === "CANCELLED") return "#94a3b8";
  return "#64748b";
}

function TraceCanvas({ inst }: { inst: Instance }) {
  const def = inst.workflow?.definitionJson;
  const nodes: Node[] = useMemo(() => {
    if (!def) return [];
    return def.nodes.map((n, i) => {
      const task = inst.tasks?.find((t) => t.nodeId === n.id);
      const current = inst.currentNodeIds?.includes(n.id);
      const st = task?.status ?? (current ? "PENDING" : inst.status === "APPROVED" && n.type === "end" ? "APPROVED" : "");
      return {
        id: n.id,
        position: { x: n.x ?? 80 + i * 180, y: n.y ?? 120 },
        data: { label: `${n.name}\n${st || n.type}` },
        style: { borderColor: nodeColor(st), borderWidth: 2, fontSize: 12 },
      };
    });
  }, [def, inst]);
  const edges: Edge[] = useMemo(
    () => (def?.edges ?? []).map((e, i) => ({ id: `e-${i}`, source: e.source, target: e.target, label: e.condition })),
    [def],
  );
  if (!def) return <p className="text-sm text-muted-foreground">无流程图</p>;
  return (
    <div className="h-64 rounded border">
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
        <Controls />
        <Background />
      </ReactFlow>
    </div>
  );
}

export function WorkflowTracePage() {
  const [items, setItems] = useState<Instance[]>([]);
  const [current, setCurrent] = useState<Instance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    workflowApi
      .instances()
      .then((rows) => {
        const list = rows as Instance[];
        setItems(list);
        setCurrent(list[0] ?? null);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="space-y-2 p-3">
        <h1 className="text-lg font-semibold">流程实例</h1>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {items.map((it) => (
          <button
            key={it.id}
            className={`w-full rounded px-3 py-2 text-left text-sm ${current?.id === it.id ? "bg-primary/10" : "hover:bg-muted"}`}
            onClick={() => setCurrent(it)}
          >
            <div>{it.workflow?.name}</div>
            <Badge>{it.status}</Badge>
          </button>
        ))}
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">节点状态 / 溯源</h2>
        {current ? (
          <ReactFlowProvider>
            <TraceCanvas inst={current} />
          </ReactFlowProvider>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs">
          {(current?.tasks ?? []).map((t, i) => (
            <Badge key={i}>
              {t.nodeName} · {t.status}
            </Badge>
          ))}
        </div>
        <ol className="space-y-3 text-sm">
          {(current?.logs ?? []).map((log) => (
            <li key={log.id} className="border-l-2 border-primary/30 pl-3">
              <div className="font-medium">
                {log.nodeName ?? "系统"} · {log.action}
              </div>
              <div className="text-muted-foreground">{log.comment}</div>
              <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</div>
            </li>
          ))}
          {!current?.logs?.length ? <p className="text-muted-foreground">暂无日志</p> : null}
        </ol>
      </Card>
    </div>
  );
}
