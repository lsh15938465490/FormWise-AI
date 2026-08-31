import { getFormWidget, type FormFieldMeta } from "@/plugins/registry";
import { fieldsFromForm, type FormFieldDef, type LayoutJson, type LinkageJson } from "@/lib/form-schema";
import { Input, Label } from "@/components/ui/input";

export function FormFieldCanvas({
  schemaJson,
  layoutJson,
  values,
  onChange,
  errors,
  linkageJson,
}: {
  schemaJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  errors?: Record<string, string>;
  linkageJson?: Record<string, unknown>;
}) {
  const fields = fieldsFromForm(schemaJson, layoutJson);
  const layout = layoutJson as LayoutJson;
  const linkage = (linkageJson as LinkageJson | undefined) ?? { rules: [] };
  const groups = layout.groups?.length
    ? layout.groups
    : [{ key: "all", title: "表单字段", fields: fields.map((f) => f.name) }];

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{group.title}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {group.fields.map((name) => {
              const def = fields.find((f) => f.name === name);
              if (!def) return null;
              return (
                <FieldSlot
                  key={name}
                  def={applyLinkage(def, values, linkage)}
                  value={values[name]}
                  allValues={values}
                  error={errors?.[name]}
                  onChange={(v) => onChange(name, v)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function applyLinkage(def: FormFieldDef, values: Record<string, unknown>, linkage: LinkageJson): FormFieldDef {
  const rule = linkage.rules?.find((r) => r.target === def.name && r.type === "filter-options");
  if (!rule) return def;
  const sourceVal = String(values[rule.source] ?? "");
  const mapped = rule.optionMap?.[sourceVal];
  if (mapped) return { ...def, options: mapped };
  return def;
}

function FieldSlot({
  def,
  value,
  allValues,
  error,
  onChange,
}: {
  def: FormFieldDef;
  value: unknown;
  allValues: Record<string, unknown>;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  if (def.component === "SubForm") {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const items = def.itemFields?.length ? def.itemFields : [{ name: "content", title: "内容", type: "string" as const, component: "Input", required: false }];
    return (
      <div className="space-y-2 md:col-span-2">
        <div className="text-sm font-medium">{def.title}</div>
        {rows.map((row, idx) => (
          <div key={idx} className="grid gap-2 rounded border p-2 md:grid-cols-2">
            {items.map((item) => {
              const Widget = getFormWidget(item.component);
              const field: FormFieldMeta = { name: item.name, title: item.title, component: item.component, options: item.options };
              return (
                <Widget
                  key={item.name}
                  field={field}
                  value={row[item.name]}
                  allValues={row}
                  onChange={(v) => {
                    const next = [...rows];
                    next[idx] = { ...row, [item.name]: v };
                    onChange(next);
                  }}
                />
              );
            })}
            <button className="text-sm text-destructive" type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
              删除
            </button>
          </div>
        ))}
        <button className="text-sm text-primary" type="button" onClick={() => onChange([...rows, {}])}>
          新增一行
        </button>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }
  const field: FormFieldMeta = {
    name: def.name,
    title: def.title,
    component: def.component,
    placeholder: def.placeholder,
    options: def.options,
    required: def.required,
  };
  const Widget = getFormWidget(def.component);
  return (
    <div>
      <Widget field={field} value={value} allValues={allValues} onChange={onChange} />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function SimpleInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Label>
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </Label>
  );
}
