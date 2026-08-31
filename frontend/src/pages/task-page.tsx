import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { taskApi } from "@/lib/api";

type Task = {
  id: string;
  nodeName: string;
  status: string;
  comment?: string;
  instance?: { id: string; workflow?: { name?: string }; status?: string };
};

export function TaskPage() {
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [items, setItems] = useState<Task[]>([]);
  const [comment, setComment] = useState("同意");
  const [error, setError] = useState("");

  async function load(next = tab) {
    setItems((next === "todo" ? await taskApi.todo() : await taskApi.done().catch(() => [])) as Task[]);
  }

  useEffect(() => {
    load("todo").catch((err: Error) => setError(err.message));
  }, []);

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
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className="flex items-center justify-between">
            <div>
              <div className="font-medium">{item.nodeName}</div>
              <div className="text-sm text-muted-foreground">
                {item.instance?.workflow?.name} · {item.status}
              </div>
            </div>
            {tab === "todo" ? (
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    await taskApi.approve(item.id, comment);
                    await load("todo");
                  }}
                >
                  通过
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await taskApi.reject(item.id, comment || "驳回");
                    await load("todo");
                  }}
                >
                  驳回
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">暂无数据</p> : null}
      </div>
    </div>
  );
}
