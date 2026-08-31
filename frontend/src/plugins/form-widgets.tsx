import type { FormWidgetProps } from "@/plugins/registry";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { POSITION_BY_DEPT } from "@/lib/form-schema";
import type { ReactNode } from "react";

function FieldLabel({ field, children }: { field: FormWidgetProps["field"]; children: ReactNode }) {
  return (
    <Label>
      {field.title ?? field.name}
      {children}
    </Label>
  );
}

export function InputWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <FieldLabel field={field}>
      <Input placeholder={field.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </FieldLabel>
  );
}

export function TextareaWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <FieldLabel field={field}>
      <Textarea placeholder={field.placeholder} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </FieldLabel>
  );
}

export function SelectWidget({ field, value, onChange, allValues }: FormWidgetProps) {
  const dept = allValues?.department;
  const linked = field.name === "position" && typeof dept === "string" ? POSITION_BY_DEPT[dept] : undefined;
  const options = linked ?? field.options ?? [];
  return (
    <FieldLabel field={field}>
      <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">请选择</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </FieldLabel>
  );
}

export function NumberInputWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <FieldLabel field={field}>
      <Input
        type="number"
        placeholder={field.placeholder}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </FieldLabel>
  );
}

export function DatePickerWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <FieldLabel field={field}>
      <Input type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </FieldLabel>
  );
}

export function UploadWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <FieldLabel field={field}>
      <Input type="file" onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")} />
      {value ? <span className="text-xs text-muted-foreground">{String(value)}</span> : null}
    </FieldLabel>
  );
}

export function RadioWidget({ field, value, onChange }: FormWidgetProps) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{field.title ?? field.name}</legend>
      <div className="flex flex-wrap gap-3">
        {(field.options ?? []).map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-sm font-normal">
            <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)} />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxWidget({ field, value, onChange }: FormWidgetProps) {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{field.title ?? field.name}</legend>
      <div className="flex flex-wrap gap-3">
        {(field.options ?? []).map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-sm font-normal">
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => {
                const next = selected.includes(opt.value)
                  ? selected.filter((v) => v !== opt.value)
                  : [...selected, opt.value];
                onChange(next);
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubFormWidget({ field, value, onChange }: FormWidgetProps) {
  const rows = Array.isArray(value) ? (value as Record<string, string>[]) : [];
  return (
    <div className="space-y-2 md:col-span-2">
      <div className="text-sm font-medium">{field.title ?? field.name}</div>
      {rows.map((row, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            placeholder="子项内容"
            value={row.content ?? ""}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...row, content: e.target.value };
              onChange(next);
            }}
          />
          <button className="text-sm text-destructive" type="button" onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
            删除
          </button>
        </div>
      ))}
      <button className="text-sm text-primary" type="button" onClick={() => onChange([...rows, { content: "" }])}>
        新增一行
      </button>
    </div>
  );
}
