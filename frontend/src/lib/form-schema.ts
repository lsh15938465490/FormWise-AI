/**
 * 把后端 JSON Schema / layout 转成字段列表，再转回去。
 * 页面不要自己拼 properties，统一走这里，改一处全站生效。
 */
export type FieldOption = { label: string; value: string };

export type FormFieldDef = {
  name: string;
  title: string;
  type: "string" | "number" | "array";
  component: string;
  required: boolean;
  placeholder?: string;
  group?: string;
  options?: FieldOption[];
  validations?: { min?: number; max?: number; pattern?: string };
  defaultValue?: unknown;
  itemFields?: FormFieldDef[];
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
};

export type LayoutJson = { groups: { key: string; title: string; fields: string[] }[] };
export type LinkageJson = {
  rules: { source: string; target: string; type: string; optionMap?: Record<string, FieldOption[]> }[];
};

export const COMPONENTS = [
  "Input",
  "Textarea",
  "Select",
  "NumberInput",
  "DatePicker",
  "Upload",
  "Radio",
  "Checkbox",
  "SubForm",
] as const;

export const GROUPS = [
  { key: "basic", title: "基础信息" },
  { key: "business", title: "业务信息" },
  { key: "remark", title: "备注信息" },
];

export function fieldsFromForm(schemaJson: Record<string, unknown>, layoutJson: Record<string, unknown>): FormFieldDef[] {
  const schema = schemaJson as JsonSchema;
  const layout = layoutJson as LayoutJson;
  const groupOf: Record<string, string> = {};
  for (const g of layout.groups ?? []) {
    for (const f of g.fields ?? []) groupOf[f] = g.key;
  }
  return Object.entries(schema.properties ?? {}).map(([name, raw]) => ({
    name,
    title: String(raw.title ?? name),
    type: (raw.type as FormFieldDef["type"]) ?? "string",
    component: String(raw.component ?? "Input"),
    required: (schema.required ?? []).includes(name),
    placeholder: raw.placeholder as string | undefined,
    group: groupOf[name] ?? "basic",
    options: raw.options as FieldOption[] | undefined,
    validations: raw.validations as FormFieldDef["validations"],
    defaultValue: raw.default,
    itemFields: (raw.itemFields as FormFieldDef[] | undefined) ?? undefined,
  }));
}

export function formFromFields(name: string, fields: FormFieldDef[], linkage: LinkageJson) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.name] = {
      type: f.type,
      title: f.title,
      component: f.component,
      placeholder: f.placeholder,
      options: f.options,
      validations: f.validations,
      default: f.defaultValue,
      itemFields: f.itemFields,
    };
    if (f.required) required.push(f.name);
  }
  const layoutJson: LayoutJson = {
    groups: GROUPS.map((g) => ({
      ...g,
      fields: fields.filter((f) => (f.group ?? "basic") === g.key).map((f) => f.name),
    })).filter((g) => g.fields.length),
  };
  const dataModelJson = {
    fields: fields.map((f) => ({ name: f.name, type: f.type, required: f.required })),
  };
  return {
    name,
    schemaJson: { type: "object" as const, properties, required },
    layoutJson,
    linkageJson: linkage,
    dataModelJson,
  };
}

export const POSITION_BY_DEPT: Record<string, FieldOption[]> = {
  hr: [
    { label: "人事专员", value: "hr-specialist" },
    { label: "人事经理", value: "hr-manager" },
  ],
  finance: [
    { label: "会计", value: "accountant" },
    { label: "财务经理", value: "finance-manager" },
  ],
  rd: [
    { label: "工程师", value: "engineer" },
    { label: "研发经理", value: "rd-manager" },
  ],
  admin: [
    { label: "行政专员", value: "admin-specialist" },
    { label: "行政经理", value: "admin-manager" },
  ],
};
