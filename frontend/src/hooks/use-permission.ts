import { useAuthStore } from "@/stores/auth-store";

export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const can = (code: string) => {
    if (!user) return false;
    if (user.roles.includes("admin")) return true;
    return user.permissions.includes(code);
  };
  return { user, can };
}
