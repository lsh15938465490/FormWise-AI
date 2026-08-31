import { z, type ZodTypeAny } from "zod";
import type { FormFieldDef, JsonSchema } from "@/lib/form-schema";
import { fieldsFromForm } from "@/lib/form-schema";

function fieldZod(field: FormFieldDef): ZodTypeAny {
  if (field.component === "SubForm") {
    const itemShape: Record<string, ZodTypeAny> = {};
    for (const item of field.itemFields ?? [{ name: "content", title: "内容", type: "string", component: "Input", required: false }]) {
      itemShape[item.name] = fieldZod(item);
    }
    const arr = z.array(z.object(itemShape));
    return field.required ? arr.min(1, `${field.title}至少一行`) : arr.optional();
  }
  if (field.component === "Checkbox") {
    const arr = z.array(z.string());
    if (field.required) return arr.min(1, `${field.title}必填`);
    return arr.optional();
  }
  if (field.type === "number" || field.component === "NumberInput") {
    let schema = z.coerce.number({ invalid_type_error: `${field.title}须为数字` });
    if (field.validations?.min !== undefined) schema = schema.min(field.validations.min, `${field.title}须大于等于${field.validations.min}`);
    if (field.validations?.max !== undefined) schema = schema.max(field.validations.max);
    return field.required ? schema : schema.optional();
  }
  let schema = z.string();
  if (field.validations?.pattern) {
    schema = schema.regex(new RegExp(field.validations.pattern), `${field.title}格式不正确`);
  }
  if (field.required) schema = schema.min(1, `${field.title}必填`);
  return field.required ? schema : schema.optional();
}

export function schemaToZod(schemaJson: Record<string, unknown>, layoutJson: Record<string, unknown> = { groups: [] }) {
  const fields = fieldsFromForm(schemaJson, layoutJson);
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) shape[f.name] = fieldZod(f);
  return z.object(shape);
}

export function schemaToZodFromJson(schemaJson: JsonSchema) {
  return schemaToZod(schemaJson, { groups: [] });
}

function tsType(field: FormFieldDef): string {
  if (field.component === "SubForm") {
    const inner = (field.itemFields ?? []).map((i) => `${i.name}: ${tsType(i)}`).join("; ");
    return `{ ${inner} }[]`;
  }
  if (field.component === "Checkbox") return "string[]";
  if (field.type === "number" || field.component === "NumberInput") return "number";
  return "string";
}

/** 由 JSON Schema 生成 TypeScript 接口文本，保证配置与类型一致 */
export function schemaToTs(name: string, schemaJson: Record<string, unknown>, layoutJson: Record<string, unknown> = { groups: [] }) {
  const fields = fieldsFromForm(schemaJson, layoutJson);
  const lines = fields.map((f) => `  ${f.name}${f.required ? "" : "?"}: ${tsType(f)};`);
  return `export interface ${name.replace(/[^\w]/g, "") || "FormValues"} {\n${lines.join("\n")}\n}`;
}
