import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { taskApi } from "@/lib/api";

type Task = {
  id: string;
  nodeName: string;
  status: string;
  comment?: string;
  dueAt?: string;
  createdAt?: string;
  formName?: string;
  initiatorName?: string;
  instance?: { id: string; workflow?: { name?: string }; status?: string };
};

function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isDevName(name?: string) {
  if (!name) return true;
  return /测$|测试|test|debug|demo/i.test(name);
}

function subjectOf(task: Task) {
  const form = task.formName?.trim();
  const flow = task.instance?.workflow?.name?.trim();
  if (form && !isDevName(form)) return form;
  if (flow && !isDevName(flow)) return flow.replace(/流程$/, "");
  return "审批申请";
}

function taskSummary(task: Task) {
  const bits: string[] = [];
  bits.push(subjectOf(task));
  if (task.initiatorName) bits.push(`${task.initiatorName}提交`);
  const due = formatWhen(task.dueAt);
  const arrived = formatWhen(task.createdAt);
  if (task.status === "TIMEOUT") bits.push(due ? `已超过 ${due} 的审批时限` : "已超过审批时限");
  else if (due) bits.push(`请于 ${due} 前审批`);
  else if (arrived) bits.push(`${arrived} 到达`);
  return bits.join(" · ");
}

type Action = "approve" | "reject";

export function TaskPage() {
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [items, setItems] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ task: Task; action: Action } | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function load(next = tab) {
    setItems((next === "todo" ? await taskApi.todo() : await taskApi.done().catch(() => [])) as Task[]);
  }

  useEffect(() => {
    load("todo").catch((err: Error) => setError(err.message));
  }, []);

  function openAction(task: Task, action: Action) {
    setPending({ task, action });
    setComment("");
    setError("");
  }

  async function confirm() {
    if (!pending) return;
    const text = comment.trim();
    if (!text) {
      setError("请填写审批意见");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (pending.action === "approve") await taskApi.approve(pending.task.id, text);
      else await taskApi.reject(pending.task.id, text);
      setPending(null);
      setComment("");
      await load("todo");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">待办审批</h1>
      <div className="flex gap-2">
        <Button
          variant={tab === "todo" ? "primary" : "outline"}
          onClick={() => {
            setTab("todo");
            load("todo");
          }}
        >
          待办
        </Button>
        <Button
          variant={tab === "done" ? "primary" : "outline"}
          onClick={() => {
            setTab("done");
            load("done");
          }}
        >
          已办
        </Button>
      </div>
      {error && !pending ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{item.nodeName}</div>
              <div className="text-sm text-muted-foreground">{taskSummary(item)}</div>
            </div>
            {tab === "todo" ? (
              <div className="flex gap-2">
                <Button onClick={() => openAction(item, "approve")}>通过</Button>
                <Button variant="danger" onClick={() => openAction(item, "reject")}>
                  驳回
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">暂无数据</p> : null}
      </div>
      {pending ? (
        <Modal
          open
          title={pending.action === "approve" ? "通过并填写意见" : "驳回并填写意见"}
          onClose={() => {
            if (!saving) {
              setPending(null);
              setComment("");
              setError("");
            }
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pending.task.nodeName} · {taskSummary(pending.task)}
            </p>
            <Textarea
              autoFocus
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="请输入审批意见"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setPending(null);
                  setComment("");
                  setError("");
                }}
              >
                取消
              </Button>
              <Button variant={pending.action === "reject" ? "danger" : "primary"} disabled={saving} onClick={confirm}>
                {saving ? "提交中..." : pending.action === "approve" ? "确认通过" : "确认驳回"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
