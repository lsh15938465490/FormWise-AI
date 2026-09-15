import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DynamicFormRenderer } from "@/components/form-engine/dynamic-form-renderer";
import { formApi } from "@/lib/api";
import { errMsg } from "@/lib/err-msg";
import { COMPONENTS, COMPONENT_LABELS, GROUPS, fieldsFromForm, formFromFields, isChoiceComponent, resolveFieldOptions, type FormFieldDef } from "@/lib/form-schema";
import { useFormBuilderStore } from "@/stores/form-builder-store";
import { usePermission } from "@/hooks/use-permission";
import { FORM_STATUS, labelOf } from "@/lib/labels";

export function FormBuilderPage() {
  const { can } = usePermission();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const store = useFormBuilderStore();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ kind: "生成" | "微调"; prompt: string; summary: string }[]>([]);
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
    if (store.prompt.trim().length < 4) {
      setError("提示词至少 4 个字");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await formApi.aiGenerate(store.prompt.trim(), refine && id ? id : undefined);
      const fields = fieldsFromForm(res.form.schemaJson, res.form.layoutJson);
      store.setForm(res.form, fields, res.form.linkageJson as { rules: { source: string; target: string; type: string; optionMap?: Record<string, { label: string; value: string }[]> }[] });
      setParams({ id: res.form.id });
      const keys = Object.keys((res.form.schemaJson as { properties?: Record<string, unknown> })?.properties ?? {});
      setChat((c) => [
        ...c,
        {
          kind: refine ? "微调" : "生成",
          prompt: store.prompt.trim(),
          summary: keys.length ? keys.join("、") : res.form.name,
        },
      ]);
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
    <div className="grid h-full min-h-0 gap-3 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)_280px]">
      <Card className="flex min-h-0 flex-col gap-2 overflow-hidden p-4">
        <h1 className="shrink-0 text-base font-semibold">智能生成</h1>
        {store.form ? (
          <Label className="shrink-0">
            表单名称
            <Input value={store.form.name} onChange={(e) => store.updateForm({ name: e.target.value })} />
          </Label>
        ) : null}
        <Textarea className="min-h-[5.5rem] max-h-28 shrink-0 resize-none" value={store.prompt} onChange={(e) => store.setPrompt(e.target.value)} />
        {can("form:write") ? (
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Button className="h-9 w-full px-2" onClick={() => generate(false)} disabled={loading}>
              {loading ? "生成中..." : "解析并生成"}
            </Button>
            <Button className="h-9 w-full px-2" variant="outline" onClick={() => generate(true)} disabled={loading || !id}>
              对话微调
            </Button>
          </div>
        ) : null}
        {chat.length ? (
          <ol className="max-h-14 shrink-0 space-y-0.5 overflow-auto text-[11px] leading-4 text-muted-foreground">
            {chat.slice(-3).map((t, i) => (
              <li key={`${t.kind}-${i}`}>
                {t.kind}：{t.summary}
              </li>
            ))}
          </ol>
        ) : null}
        <div className="flex shrink-0 gap-2">
          <Button className="h-9" variant="outline" onClick={() => persist(false)} disabled={!store.form}>
            保存
          </Button>
          <Button className="h-9" variant="outline" onClick={() => persist(true)} disabled={!store.form}>
            发布
          </Button>
        </div>
        {error ? <p className="shrink-0 text-xs text-destructive">{error}</p> : null}
        {msg ? <p className="shrink-0 truncate text-[11px] text-muted-foreground" title={msg}>{msg}</p> : null}
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h2 className="text-sm font-medium">字段</h2>
          <Button className="h-8 gap-1 px-3 shadow-sm" onClick={addField}>
            <Plus size={14} strokeWidth={2.5} />
            新增
          </Button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto text-sm">
          {store.fields.map((f) => (
            <li key={f.name}>
              <button
                className={`w-full rounded px-2 py-1 text-left ${store.selectedField === f.name ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                onClick={() => store.setSelectedField(f.name)}
              >
                {f.title} · {COMPONENT_LABELS[f.component] ?? f.component}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex min-h-0 flex-col overflow-hidden p-4">
        <h2 className="mb-2 shrink-0 text-base font-semibold">预览{store.form?.status ? ` · ${labelOf(FORM_STATUS, store.form.status)}` : ""}</h2>
        {store.fields.length ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <DynamicFormRenderer schemaJson={preview.schemaJson} layoutJson={preview.layoutJson} linkageJson={store.linkage} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">用一句话描述业务，或手动新增字段</p>
        )}
      </Card>
      <Card className="flex min-h-0 flex-col overflow-hidden p-4">
        <h2 className="mb-2 shrink-0 text-base font-semibold">字段属性</h2>
        {selected ? (
          <>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              <Label>
                显示名
                <Input value={selected.title} onChange={(e) => patchSelected({ title: e.target.value })} />
              </Label>
              <Label>
                组件
                <Select
                  value={selected.component}
                  onChange={(e) => {
                    const component = e.target.value;
                    const patch: Partial<FormFieldDef> = { component };
                    if (isChoiceComponent(component) && !(selected.options ?? []).some((o) => o.label || o.value)) {
                      patch.options = resolveFieldOptions({ ...selected, component });
                    }
                    patchSelected(patch);
                  }}
                >
                  {COMPONENTS.map((c) => (
                    <option key={c} value={c}>
                      {COMPONENT_LABELS[c] ?? c}
                    </option>
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
              <div className="space-y-1.5">
                <span className="text-sm font-medium">选项</span>
                <p className="text-[11px] leading-4 text-muted-foreground">每行一个选项。需要区分显示和存储时写成「年假:annual」。</p>
                <Textarea
                  className="min-h-20 whitespace-pre-wrap"
                  placeholder={"年假\n事假"}
                  value={(selected.options ?? []).map((o) => (o.label === "" && o.value === "" ? "" : `${o.label}:${o.value}`)).join("\n")}
                  onChange={(e) =>
                    patchSelected({
                      options: e.target.value.split("\n").map((line) => {
                        if (!line.trim()) return { label: "", value: "" };
                        const idx = line.indexOf(":");
                        if (idx < 0) return { label: line, value: line };
                        return { label: line.slice(0, idx), value: line.slice(idx + 1) };
                      }),
                    })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full"
                  onClick={() => patchSelected({ options: [...(selected.options ?? []), { label: "", value: "" }] })}
                >
                  添加一行
                </Button>
              </div>
            </div>
            <div className="mt-2 flex shrink-0 gap-2 border-t border-border pt-2">
              <Button variant="outline" className="h-9" onClick={() => move(-1)}>
                上移
              </Button>
              <Button variant="outline" className="h-9" onClick={() => move(1)}>
                下移
              </Button>
              <Button
                variant="danger"
                className="h-9"
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
