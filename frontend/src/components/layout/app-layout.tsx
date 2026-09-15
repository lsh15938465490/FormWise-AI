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
  { to: "/forms", label: "表单", icon: FileText },
  { to: "/workflows", label: "审批流程", icon: GitBranch },
  { to: "/records", label: "业务数据", icon: Table2 },
  { to: "/tasks", label: "待办审批", icon: Shield },
  { to: "/messages", label: "消息", icon: Inbox },
  { to: "/admin/users", label: "组织权限", icon: Users, admin: true },
  { to: "/admin/plugins", label: "控件扩展", icon: Puzzle, admin: true },
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
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-white p-4">
        <div className="mb-6 shrink-0 px-2">
          <div className="text-lg font-semibold">FormWise-AI</div>
          <div className="text-xs text-muted-foreground">零代码应用搭建</div>
        </div>
        <nav className="space-y-1">
          {nav
            .filter((item) => !item.admin || user?.roles.includes("admin"))
            .map((item) => (
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-6">
          <div className="text-sm text-muted-foreground">表单填报与审批</div>
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
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="h-full min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
