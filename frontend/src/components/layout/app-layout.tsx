import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, FileText, GitBranch, Inbox, LayoutDashboard, LogOut, Puzzle, Shield, Table2, Users } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useRealtimeNotifications } from "@/hooks/use-websocket";
import { pluginApi } from "@/lib/api";
import { syncEnabledPlugins } from "@/plugins/registry";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "工作台", icon: LayoutDashboard },
  { to: "/forms", label: "AI 表单引擎", icon: FileText },
  { to: "/workflows", label: "工作流引擎", icon: GitBranch },
  { to: "/records", label: "数据管理", icon: Table2 },
  { to: "/tasks", label: "待办审批", icon: Shield },
  { to: "/messages", label: "消息中心", icon: Inbox },
  { to: "/admin/users", label: "用户权限", icon: Users },
  { to: "/admin/plugins", label: "插件中心", icon: Puzzle },
];

export function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const unread = useNotificationStore((s) => s.items.filter((i) => !i.isRead).length);
  useRealtimeNotifications();

  useEffect(() => {
    if (!user) navigate("/login");
    else {
      pluginApi
        .list()
        .then((items) => syncEnabledPlugins(items.filter((p) => p.enabled).map((p) => p.code)))
        .catch(() => undefined);
    }
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-white p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold">FormWise-AI</div>
          <div className="text-xs text-muted-foreground">零代码应用搭建</div>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
          <div className="text-sm text-muted-foreground">企业轻量化业务应用平台</div>
          <div className="flex items-center gap-3 text-sm">
            <button className="inline-flex items-center gap-1 text-muted-foreground" onClick={() => navigate("/messages")}>
              <Bell size={16} />
              {unread}
            </button>
            <span>{user?.name}</span>
            <button
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut size={16} />
              退出
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
