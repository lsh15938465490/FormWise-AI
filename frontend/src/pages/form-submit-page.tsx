import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { SchemaForm } from "@/components/form-engine/schema-form";
import { formApi, recordApi } from "@/lib/api";
import { errMsg } from "@/lib/err-msg";
import type { FormEntity } from "@/types/api";

export function FormSubmitPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormEntity | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    formApi
      .get(id)
      .then(setForm)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  if (!form) return <p className="text-sm text-muted-foreground">{error || "加载中..."}</p>;
  if (form.status !== "PUBLISHED") return <p>表单未发布，无法提交</p>;

  return (
    <Card className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">{form.name}</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      <SchemaForm
        schemaJson={form.schemaJson}
        layoutJson={form.layoutJson}
        linkageJson={form.linkageJson}
        submitText="提交申请"
        onSubmit={async (values) => {
          try {
            const res = await recordApi.create(form.id, values);
            setMsg(res.instance ? "已提交，等待审批" : "已提交");
            setTimeout(() => navigate("/records"), 800);
          } catch (err) {
            setError(errMsg(err, "提交失败"));
          }
        }}
      />
    </Card>
  );
}
