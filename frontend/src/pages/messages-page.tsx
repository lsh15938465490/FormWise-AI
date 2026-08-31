import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notificationApi } from "@/lib/api";
import { useNotificationStore } from "@/stores/notification-store";

const cats = ["ALL", "TODO", "DONE", "CC", "SYSTEM"] as const;

export function MessagesPage() {
  const items = useNotificationStore((s) => s.items);
  const setItems = useNotificationStore((s) => s.setItems);
  const markRead = useNotificationStore((s) => s.markRead);
  const [cat, setCat] = useState<(typeof cats)[number]>("ALL");

  useEffect(() => {
    notificationApi.list(cat === "ALL" ? undefined : cat).then(setItems).catch(() => undefined);
  }, [cat, setItems]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">消息中心</h1>
        <Button
          variant="outline"
          onClick={async () => {
            await notificationApi.readAll();
            const latest = await notificationApi.list(cat === "ALL" ? undefined : cat);
            setItems(latest);
          }}
        >
          全部已读
        </Button>
      </div>
      <div className="flex gap-2">
        {cats.map((c) => (
          <Button key={c} variant={cat === c ? "primary" : "outline"} onClick={() => setCat(c)}>
            {c}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        {items.map((n) => (
          <Card
            key={n.id}
            className={`cursor-pointer ${n.isRead ? "opacity-70" : ""}`}
            onClick={async () => {
              await notificationApi.read(n.id);
              markRead(n.id);
            }}
          >
            <div className="text-xs text-muted-foreground">{n.category}</div>
            <div className="font-medium">{n.title}</div>
            <div className="text-sm">{n.content}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
