import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await authApi.login(email, password);
      useAuthStore.setState({ token: data.token });
      const me = await authApi.me();
      setSession(data.token, { ...me, roles: data.user.roles ?? me.roles });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-semibold">FormWise-AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">企业内部表单与审批</p>
        </div>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Label>
            账号
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="请输入账号" autoComplete="username" />
          </Label>
          <Label>
            密码
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" />
          </Label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={loading} type="submit">
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
