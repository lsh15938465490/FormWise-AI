import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { notificationApi } from "@/lib/api";
import { useNotificationStore } from "@/stores/notification-store";

/** 站内信：先拉历史，再连 WebSocket。断线后隔 3 秒重连，避免审批消息丢了用户不知道。 */
export function useRealtimeNotifications() {
  const token = useAuthStore((s) => s.token);
  const prepend = useNotificationStore((s) => s.prepend);
  const setItems = useNotificationStore((s) => s.setItems);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let timer: number | undefined;
    let ws: WebSocket | undefined;

    notificationApi.list().then(setItems).catch(() => undefined);

    function connect() {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token!)}`);
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as {
            type?: string;
            data?: { id: string; title: string; content: string; isRead: boolean; category: string };
          };
          if (payload.type === "notification" && payload.data) prepend(payload.data);
        } catch {
          /* 非 JSON 心跳忽略 */
        }
      };
      ws.onclose = () => {
        if (!closed) timer = window.setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ws?.close();
    };
  }, [token, prepend, setItems]);
}
