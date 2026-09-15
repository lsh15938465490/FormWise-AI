import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { formApi, roleApi, workflowApi } from "@/lib/api";
import { getWorkflowNodes } from "@/plugins/registry";
import type { FormEntity, WorkflowEntity } from "@/types/api";

const ROLE_LABELS: Record<string, string> = {
  admin: "企业管理员",
  manager: "部门经理",
  employee: "员工",
};

const FALLBACK_ROLES = [
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "employee", label: ROLE_LABELS.employee },
];

const REJECT_RULES = [
  { value: "back-to-start", label: "退回发起人" },
  { value: "end", label: "结束流程" },
  { value: "previous", label: "退回上一节点" },
];

const HANDLE_SIDES: { id: string; position: Position }[] = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
];

function FlowBoxNode({ id, data, selected }: NodeProps) {
  const { setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(data.label ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(data.label ?? ""));
  }, [data.label, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  function commit() {
    const next = draft.trim() || String(data.label ?? "未命名");
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: next } } : n)));
    setEditing(false);
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      setDraft(String(data.label ?? ""));
      setEditing(false);
    }
  }

  return (
    <div
      className={`min-w-[120px] rounded-md border bg-white px-4 py-2 text-center text-sm shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/20" : "border-neutral-400"
      }`}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest(".react-flow__handle")) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {HANDLE_SIDES.map((side) => (
        <Handle
          key={side.id}
          id={side.id}
          type="source"
          position={side.position}
          isConnectableStart
          isConnectableEnd
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-primary"
        />
      ))}
      {editing ? (
        <input
          ref={inputRef}
          className="nodrag nopan nowheel w-full bg-transparent text-center text-sm outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onInputKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="cursor-text select-none">{String(data.label ?? "")}</div>
      )}
    </div>
  );
}

const nodeTypes = { flowNode: FlowBoxNode };

function toFlow(def: WorkflowEntity["definitionJson"]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (def.nodes ?? []).map((n, i) => ({
    id: n.id,
    type: "flowNode",
    position: { x: n.x ?? 80 + i * 200, y: n.y ?? 160 },
    data: {
      label: n.name,
      nodeType: n.type,
      assigneeRole: n.assigneeRole ?? "manager",
      timeoutHours: n.timeoutHours ?? 24,
      rejectRule: n.rejectRule ?? "back-to-start",
    },
  }));
  const edges: Edge[] = (def.edges ?? []).map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "right",
    targetHandle: e.targetHandle ?? "left",
    label: e.condition,
    type: "smoothstep",
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
  const [roles, setRoles] = useState(FALLBACK_ROLES);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  useEffect(() => {
    formApi.list().then((r) => setForms(r.items.filter((f) => f.status === "PUBLISHED")));
    roleApi
      .list()
      .then((items) => {
        const mapped = items
          .map((r) => {
            const value = String(r.code ?? "");
            const label = String(r.name ?? ROLE_LABELS[value] ?? value);
            return value ? { value, label } : null;
          })
          .filter((r): r is { value: string; label: string } => Boolean(r));
        if (mapped.length) setRoles(mapped);
      })
      .catch(() => undefined);
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
        type: "flowNode",
      },
    ]);
  }

  const selectedNode = nodes.find((n) => n.id === selected);

  function removeSelectedNode() {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected));
    setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected));
    setSelected(null);
  }

  function removeSelectedEdge() {
    if (!selectedEdge) return;
    setEdges((es) => es.filter((e) => e.id !== selectedEdge));
    setSelectedEdge(null);
  }

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
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        condition: e.label as string | undefined,
      })),
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
            nodeTypes={nodeTypes}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: "smoothstep" }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodeClick={(_, n) => {
              setSelected(n.id);
              setSelectedEdge(null);
            }}
            onEdgeClick={(_, e) => {
              setSelectedEdge(e.id);
              setSelected(null);
            }}
            onPaneClick={() => {
              setSelected(null);
              setSelectedEdge(null);
            }}
            onNodesDelete={() => setSelected(null)}
            onEdgesDelete={() => setSelectedEdge(null)}
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
            <>
              <Label>
                分支条件（选填）
                <Input
                  placeholder="例如金额大于1000可写 amount>1000"
                  value={String(edges.find((e) => e.id === selectedEdge)?.label ?? "")}
                  onChange={(e) =>
                    setEdges((es) => es.map((x) => (x.id === selectedEdge ? { ...x, label: e.target.value } : x)))
                  }
                />
              </Label>
              <Button variant="danger" type="button" onClick={removeSelectedEdge}>
                删除连线
              </Button>
            </>
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
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                  {roles.some((r) => r.value === String(selectedNode.data.assigneeRole ?? "manager")) ? null : (
                    <option value={String(selectedNode.data.assigneeRole)}>
                      {ROLE_LABELS[String(selectedNode.data.assigneeRole)] ?? String(selectedNode.data.assigneeRole)}
                    </option>
                  )}
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
                <Select
                  value={String(selectedNode.data.rejectRule ?? "back-to-start")}
                  onChange={(e) =>
                    setNodes((ns) => ns.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, rejectRule: e.target.value } } : n)))
                  }
                >
                  {REJECT_RULES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Label>
              <Button variant="danger" type="button" onClick={removeSelectedNode}>
                删除节点
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">点击画布上的节点或连线进行设置，也可点下方删除。</p>
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

