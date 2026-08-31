import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DynamicFormRenderer } from "@/components/form-engine/dynamic-form-renderer";
import { formApi } from "@/lib/api";
import { errMsg } from "@/lib/err-msg";
import { COMPONENTS, GROUPS, fieldsFromForm, formFromFields, type FormFieldDef } from "@/lib/form-schema";
import { schemaToTs } from "@/lib/schema-to-zod";
import { useFormBuilderStore } from "@/stores/form-builder-store";
import { usePermission } from "@/hooks/use-permission";

export function FormBuilderPage() {
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const store = useFormBuilderStore();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<string[]>([]);
  const selected = store.fields.find((f) => f.name === store.selectedField);

  useEffect(() => {
    if (!id) return;
    formApi
      .get(id)
      .then((form) => {
        const draft = form.drafts?.[0]?.contentJson as { fields?: FormFieldDef[]; linkage?: { rules: never[] } } | undefined;
        const fields = draft?.fields ?? fieldsFromForm(form.schemaJson, form.layoutJson);
        const linkage = draft?.linkage ?? (form.linkageJson as { rules: { source: string; target: string; type: string }[] });
        store.setForm(form, fields, linkage);
      })
      .catch((err) => setError(errMsg(err, "加载失败")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || !store.dirty || !can("form:write")) return;
    const t = setTimeout(() => {
      formApi
        .saveDraft(id, { fields: store.fields, linkage: store.linkage })
        .then(() => setMsg("草稿已自动保存"))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [id, store.dirty, store.fields, store.linkage, can]);

  const preview = useMemo(() => formFromFields(store.form?.name ?? "未命名", store.fields, store.linkage), [store.form, store.fields, store.linkage]);

  async function generate(refine = false) {
    setLoading(true);
    setError("");
    try {
      const res = await formApi.aiGenerate(store.prompt, refine && id ? id : undefined);
      const fields = fieldsFromForm(res.form.schemaJson, res.form.layoutJson);
      store.setForm(res.form, fields, res.form.linkageJson as { rules: { source: string; target: string; type: string; optionMap?: Record<string, { label: string; value: string }[]> }[] });
      setParams({ id: res.form.id });
      setChat((c) => [...c, store.prompt]);
      if (res.generated?.layoutTip) setMsg(res.generated.layoutTip);
    } catch (err) {
      setError(errMsg(err, "生成失败"));
    } finally {
      setLoading(false);
    }
  }

  async function persist(publish = false) {
    if (!store.form) return;
    setError("");
    try {
      const payload = { ...formFromFields(store.form.name, store.fields, store.linkage), visibleRoleCodes: store.form.visibleRoleCodes ?? [] };
      const updated = await formApi.update(store.form.id, payload);
      if (publish) await formApi.publish(store.form.id);
      const latest = await formApi.get(store.form.id);
      store.setForm(latest, store.fields, store.linkage);
      store.setDirty(false);
      setMsg(publish ? `已发布 ${updated.name}` : "已保存配置");
    } catch (err) {
      setError(errMsg(err, "保存失败"));
    }
  }

  function patchSelected(patch: Partial<FormFieldDef>) {
    store.setFields(store.fields.map((f) => (f.name === store.selectedField ? { ...f, ...patch } : f)));
  }

  function addField() {
    const name = `field_${Date.now().toString().slice(-4)}`;
    const field: FormFieldDef = {
      name,
      title: "新字段",
      type: "string",
      component: "Input",
      required: false,
      group: "basic",
      placeholder: "请输入",
    };
    store.setFields([...store.fields, field]);
    store.setSelectedField(name);
  }

  function move(dir: -1 | 1) {
    const idx = store.fields.findIndex((f) => f.name === store.selectedField);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= store.fields.length) return;
    const copy = [...store.fields];
    const [item] = copy.splice(idx, 1);
    copy.splice(next, 0, item);
    store.setFields(copy);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr_320px]">
      <Card className="space-y-3">
        <h1 className="text-lg font-semibold">AI 解析</h1>
        <Textarea value={store.prompt} onChange={(e) => store.setPrompt(e.target.value)} />
        {can("form:write") ? (
          <>
            <Button onClick={() => generate(false)} disabled={loading}>
              {loading ? "生成中..." : "解析并生成"}
            </Button>
            <Button variant="outline" onClick={() => generate(true)} disabled={loading || !id}>
              按当前表对话微调
            </Button>
          </>
        ) : null}
        {chat.length ? (
          <ol className="max-h-24 space-y-1 overflow-auto text-xs text-muted-foreground">
            {chat.map((t, i) => (
              <li key={i}>对话{i + 1}：{t.slice(0, 40)}</li>
            ))}
          </ol>
        ) : null}
        <Label>
          谁能看到此表（空=有读权限的都可见）
          <Input
            placeholder="employee,manager"
            value={(store.form?.visibleRoleCodes ?? []).join(",")}
            onChange={(e) => {
              if (!store.form) return;
              store.setForm({ ...store.form, visibleRoleCodes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }, store.fields, store.linkage);
            }}
            disabled={!store.form}
          />
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => persist(false)} disabled={!store.form}>
            保存
          </Button>
          <Button variant="outline" onClick={() => persist(true)} disabled={!store.form}>
            发布
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">字段</h2>
          <Button variant="ghost" onClick={addField}>
            新增
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {store.fields.map((f) => (
            <li key={f.name}>
              <button
                className={`w-full rounded px-2 py-1 text-left ${store.selectedField === f.name ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                onClick={() => store.setSelectedField(f.name)}
              >
                {f.title} · {f.component}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">实时预览 {store.form?.status ? `· ${store.form.status}` : ""}</h2>
        {store.fields.length ? (
          <>
            <DynamicFormRenderer schemaJson={preview.schemaJson} layoutJson={preview.layoutJson} linkageJson={store.linkage} />
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px]">{schemaToTs("FormValues", preview.schemaJson, preview.layoutJson)}</pre>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">输入业务描述后生成表单，或手动新增字段</p>
        )}
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">字段属性</h2>
        {selected ? (
          <>
            <Label>
              显示名
              <Input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value })} />
            </Label>
            <Label>
              组件
              <Select value={selected.component} onChange={(e) => patchSelected({ component: e.target.value })}>
                {COMPONENTS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Label>
            <Label>
              分组
              <Select value={selected.group} onChange={(e) => patchSelected({ group: e.target.value })}>
                {GROUPS.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              占位提示
              <Input value={selected.placeholder ?? ""} onChange={(e) => patchSelected({ placeholder: e.target.value })} />
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={selected.required} onChange={(e) => patchSelected({ required: e.target.checked })} />
              必填
            </Label>
            <Label>
              最小值
              <Input
                type="number"
                value={selected.validations?.min ?? ""}
                onChange={(e) =>
                  patchSelected({ validations: { ...selected.validations, min: e.target.value === "" ? undefined : Number(e.target.value) } })
                }
              />
            </Label>
            <Label>
              选项（label:value 每行一条）
              <Textarea
                value={(selected.options ?? []).map((o) => `${o.label}:${o.value}`).join("\n")}
                onChange={(e) =>
                  patchSelected({
                    options: e.target.value
                      .split("\n")
                      .filter(Boolean)
                      .map((line) => {
                        const [label, value] = line.split(":");
                        return { label: label ?? "", value: value ?? label ?? "" };
                      }),
                  })
                }
              />
            </Label>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => move(-1)}>
                上移
              </Button>
              <Button variant="outline" onClick={() => move(1)}>
                下移
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  store.setFields(store.fields.filter((f) => f.name !== selected.name));
                  store.setSelectedField(null);
                }}
              >
                删除
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">选择左侧字段进行微调</p>
        )}
      </Card>
    </div>
  );
}
