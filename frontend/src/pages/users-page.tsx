import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { roleApi, userApi } from "@/lib/api";
import { usePermission } from "@/hooks/use-permission";

type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  department?: string;
  userRoles: { role: { id: string; name: string; code: string } }[];
};
type Role = {
  id: string;
  name: string;
  code: string;
  permissions: { permission: { id: string; code: string; name: string } }[];
};

export function UsersPage() {
  const { can } = usePermission();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<{ id: string; code: string; name: string }[]>([]);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");

  async function load(k = keyword) {
    const [u, r, p] = await Promise.all([userApi.list(k), roleApi.list(), roleApi.permissions()]);
    setUsers(u.items as User[]);
    setRoles(r as Role[]);
    setPerms(p);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">用户</h1>
        <div className="flex gap-2">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索姓名/邮箱" />
          <Button variant="outline" onClick={() => load()}>
            搜索
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ul className="space-y-3 text-sm">
          {users.map((u) => (
            <li key={u.id} className="rounded border p-3">
              <div className="font-medium">
                {u.name} · {u.email} · {u.status}
              </div>
              {can("role:write") ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {roles.map((r) => {
                    const checked = u.userRoles.some((ur) => ur.role.id === r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={async () => {
                            const next = checked
                              ? u.userRoles.filter((ur) => ur.role.id !== r.id).map((ur) => ur.role.id)
                              : [...u.userRoles.map((ur) => ur.role.id), r.id];
                            if (!next.length) return;
                            await userApi.setRoles(u.id, next);
                            await load();
                          }}
                        />
                        {r.name}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground">{u.userRoles.map((ur) => ur.role.name).join("、")}</div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">角色权限</h2>
        {roles.map((r) => {
          const selected = new Set(r.permissions.map((p) => p.permission.id));
          return (
            <div key={r.id} className="rounded border p-3 text-sm">
              <div className="mb-2 font-medium">
                {r.name} ({r.code})
              </div>
              <div className="flex flex-wrap gap-2">
                {perms.map((p) => (
                  <label key={p.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      disabled={!can("role:write")}
                      checked={selected.has(p.id)}
                      onChange={async () => {
                        const next = selected.has(p.id)
                          ? [...selected].filter((id) => id !== p.id)
                          : [...selected, p.id];
                        await roleApi.setPermissions(r.id, next);
                        await load();
                      }}
                    />
                    {p.code}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
