import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { formApi, workflowApi } from "@/lib/api";
import { getWorkflowNodes } from "@/plugins/registry";
import type { FormEntity, WorkflowEntity } from "@/types/api";

function toFlow(def: WorkflowEntity["definitionJson"]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (def.nodes ?? []).map((n, i) => ({
    id: n.id,
    position: { x: n.x ?? 80 + i * 200, y: n.y ?? 160 },
    data: {
      label: n.name,
      nodeType: n.type,
      assigneeRole: n.assigneeRole ?? "manager",
      timeoutHours: n.timeoutHours ?? 24,
      rejectRule: n.rejectRule ?? "back-to-start",
    },
    type: n.type === "start" ? "input" : n.type === "end" ? "output" : "default",
  }));
  const edges: Edge[] = (def.edges ?? []).map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    label: e.condition,
  }));
  return { nodes, edges };
}

function DesignerInner() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const palette = useMemo(() => getWorkflowNodes(), []);
  const [name, setName] = useState("未命名流程");
  const [formId, setFormId] = useState("");
  const [forms, setForms] = useState<FormEntity[]>([]);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  useEffect(() => {
    formApi.list().then((r) => setForms(r.items.filter((f) => f.status === "PUBLISHED")));
  }, []);

  useEffect(() => {
    if (!id) {
      const seed = toFlow({
        nodes: [
          { id: "start", type: "start", name: "发起", x: 80, y: 160 },
          { id: "approve", type: "approve", name: "部门经理审批", assigneeRole: "manager", timeoutHours: 24, x: 320, y: 160 },
          { id: "end", type: "end", name: "结束", x: 560, y: 160 },
        ],
        edges: [
          { source: "start", target: "approve" },
          { source: "approve", target: "end" },
        ],
      });
      setNodes(seed.nodes);
      setEdges(seed.edges);
      return;
    }
    workflowApi.get(id).then((wf) => {
      setName(wf.name);
      setFormId(wf.formId ?? "");
      const flow = toFlow(wf.definitionJson);
      setNodes(flow.nodes);
      setEdges(flow.edges);
    });
  }, [id, setEdges, setNodes]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/reactflow");
    if (!type || !wrap.current) return;
    const bounds = wrap.current.getBoundingClientRect();
    const nid = `${type}_${Date.now()}`;
    const meta = palette.find((p) => p.type === type);
    setNodes((ns) => [
      ...ns,
      {
        id: nid,
        position: { x: e.clientX - bounds.left - 60, y: e.clientY - bounds.top - 20 },
        data: { label: meta?.label ?? type, nodeType: type, assigneeRole: "manager", timeoutHours: 24, rejectRule: "back-to-start" },
        type: type === "start" ? "input" : type === "end" ? "output" : "default",
      },
    ]);
  }

  const selectedNode = nodes.find((n) => n.id === selected);

  function definition() {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: String(n.data.nodeType ?? "approve"),
        name: String(n.data.label ?? n.id),
        assigneeRole: n.data.assigneeRole as string | undefined,
        timeoutHours: Number(n.data.timeoutHours ?? 24),
        rejectRule: n.data.rejectRule as string | undefined,
        x: n.position.x,
        y: n.position.y,
      })),
      edges: edges.map((e) => ({ source: e.source, target: e.target, condition: e.label as string | undefined })),
    };
  }

  async function save(publish = false) {
    const body = { name, formId: formId || undefined, definitionJson: definition() };
    let wf: WorkflowEntity;
    if (id) wf = await workflowApi.update(id, body);
    else {
      wf = await workflowApi.create(body);
      setParams({ id: wf.id });
    }
    if (publish) await workflowApi.publish(wf.id);
    setMsg(publish ? "已保存并发布" : "已保存");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Label className="w-56">
          流程名称
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Label>
        <Label className="w-56">
          绑定表单
          <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
            <option value="">未绑定</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Label>
        <Button onClick={() => save(false)}>保存</Button>
        <Button variant="outline" onClick={() => save(true)}>
          发布
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await workflowApi.saveTemplate({ name, category: "自定义", definitionJson: definition(), formSchemaJson: { type: "object", properties: {}, required: [] } });
            setMsg("已保存为模板");
          }}
        >
          存为模板
        </Button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[200px_1fr_260px]">
        <Card className="space-y-2">
          <h2 className="text-sm font-medium">拖拽节点</h2>
          {palette.map((n) => (
            <div
              key={n.type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("application/reactflow", n.type)}
              className="cursor-grab rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: n.color }}
            >
              {n.label}
            </div>
          ))}
        </Card>
        <div className="h-[520px] overflow-hidden rounded-lg border border-border bg-card shadow-sm" ref={wrap} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelected(n.id);
              setSelectedEdge(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdge(e.id);
              setSelected(null);
            }}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        <Card className="space-y-3">
          <h2 className="text-sm font-medium">节点 / 连线属性</h2>
          {selectedEdge ? (
            <Label>
              条件（如 amount&gt;1000，空则总是走这条线）
              <Input
                value={String(edges.find((e) => e.id === selectedEdge)?.label ?? "")}
                onChange={(e) =>
                  setEdges((es) => es.map((x) => (x.id === selectedEdge ? { ...x, label: e.target.value } : x)))
                }
              />
            </Label>
          ) : selectedNode ? (
            <>
              <Label>
                名称
                <Input
                  value={String(selectedNode.data.label ?? "")}
                  onChange={(e) =>
                    setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n)))
                  }
                />
              </Label>
              <Label>
                审批角色
                <Select
                  value={String(selectedNode.data.assigneeRole ?? "manager")}
                  onChange={(e) =>
                    setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, assigneeRole: e.target.value } } : n)))
                  }
                >
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="employee">employee</option>
                </Select>
              </Label>
              <Label>
                超时（小时）
                <Input
                  type="number"
                  value={String(selectedNode.data.timeoutHours ?? 24)}
                  onChange={(e) =>
                    setNodes((ns) =>
                      ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, timeoutHours: Number(e.target.value) } } : n)),
                    )
                  }
                />
              </Label>
              <Label>
                驳回规则
                <Input
                  value={String(selectedNode.data.rejectRule ?? "")}
                  onChange={(e) =>
                    setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, rejectRule: e.target.value } } : n)))
                  }
                />
              </Label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">点击画布节点进行配置</p>
          )}
        </Card>
      </div>
    </div>
  );
}

export function WorkflowDesignerPage() {
  return (
    <ReactFlowProvider>
      <DesignerInner />
    </ReactFlowProvider>
  );
}

