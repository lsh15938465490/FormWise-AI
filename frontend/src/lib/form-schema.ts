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

export const COMPONENT_LABELS: Record<string, string> = {
  Input: "输入框",
  Textarea: "多行文本",
  Select: "下拉选择",
  NumberInput: "数字",
  DatePicker: "日期",
  Upload: "上传",
  Radio: "单选",
  Checkbox: "多选",
  SubForm: "子表单",
};

export const GROUPS = [
  { key: "basic", title: "基础信息" },
  { key: "business", title: "业务信息" },
  { key: "remark", title: "备注信息" },
];

const CHOICE_COMPONENTS = new Set(["Select", "Radio", "Checkbox"]);

const DEPT_OPTIONS: FieldOption[] = [
  { label: "人事部", value: "hr" },
  { label: "财务部", value: "finance" },
  { label: "研发部", value: "rd" },
  { label: "行政部", value: "admin" },
];

const LEAVE_TYPE_OPTIONS: FieldOption[] = [
  { label: "年假", value: "annual" },
  { label: "事假", value: "personal" },
  { label: "病假", value: "sick" },
  { label: "调休", value: "compensatory" },
];

const OVERTIME_OPTIONS: FieldOption[] = [
  { label: "工作日加班", value: "weekday" },
  { label: "周末加班", value: "weekend" },
  { label: "节假日加班", value: "holiday" },
];

const POSITION_OPTIONS: FieldOption[] = [
  { label: "专员", value: "specialist" },
  { label: "主管", value: "supervisor" },
  { label: "经理", value: "manager" },
];

const GENERIC_OPTIONS: FieldOption[] = [
  { label: "选项一", value: "opt1" },
  { label: "选项二", value: "opt2" },
  { label: "选项三", value: "opt3" },
];

const OPTIONS_BY_NAME: Record<string, FieldOption[]> = {
  department: DEPT_OPTIONS,
  dept: DEPT_OPTIONS,
  leaveType: LEAVE_TYPE_OPTIONS,
  overtimeType: OVERTIME_OPTIONS,
  position: POSITION_OPTIONS,
  gender: [
    { label: "男", value: "male" },
    { label: "女", value: "female" },
  ],
  urgency: [
    { label: "普通", value: "normal" },
    { label: "紧急", value: "urgent" },
    { label: "特急", value: "critical" },
  ],
};

const OPTIONS_BY_KEYWORD: [string, FieldOption[]][] = [
  ["部门", DEPT_OPTIONS],
  ["请假类型", LEAVE_TYPE_OPTIONS],
  ["加班类型", OVERTIME_OPTIONS],
  ["岗位", POSITION_OPTIONS],
  ["职位", POSITION_OPTIONS],
  ["性别", OPTIONS_BY_NAME.gender],
  ["紧急", OPTIONS_BY_NAME.urgency],
  ["是否", [
    { label: "是", value: "yes" },
    { label: "否", value: "no" },
  ]],
];

function cleanOptions(raw: unknown): FieldOption[] {
  if (!Array.isArray(raw)) return [];
  const items: FieldOption[] = [];
  for (const o of raw) {
    if (o && typeof o === "object") {
      const rec = o as { label?: string; value?: string };
      const label = String(rec.label ?? rec.value ?? "").trim();
      const value = String(rec.value ?? rec.label ?? "").trim();
      if (label || value) items.push({ label: label || value, value: value || label });
    } else if (o != null && String(o).trim()) {
      const s = String(o).trim();
      items.push({ label: s, value: s });
    }
  }
  return items;
}

/** 选择类字段没有选项时，按字段名/标题补全，保证下拉始终有内容。 */
export function resolveFieldOptions(field: {
  name: string;
  title?: string;
  component?: string;
  options?: FieldOption[];
  enum?: unknown;
}): FieldOption[] {
  const component = field.component ?? "Input";
  if (!CHOICE_COMPONENTS.has(component)) return cleanOptions(field.options);
  const existing = cleanOptions(field.options).length ? cleanOptions(field.options) : cleanOptions(field.enum);
  if (existing.length) return existing;
  const found = OPTIONS_BY_NAME[field.name] ?? OPTIONS_BY_NAME[field.name.toLowerCase()];
  if (found) return found.map((o) => ({ ...o }));
  const text = `${field.title ?? ""}${field.name}`;
  for (const [kw, opts] of OPTIONS_BY_KEYWORD) {
    if (text.includes(kw)) return opts.map((o) => ({ ...o }));
  }
  return GENERIC_OPTIONS.map((o) => ({ ...o }));
}

export function isChoiceComponent(component: string) {
  return CHOICE_COMPONENTS.has(component);
}

export function displayFieldValue(field: FormFieldDef, raw: unknown): string {
  if (raw == null || raw === "") return "—";
  if (Array.isArray(raw)) return raw.map((v) => displayFieldValue(field, v)).filter((s) => s !== "—").join("、") || "—";
  const s = String(raw);
  const opt = field.options?.find((o) => o.value === s || o.label === s);
  return opt?.label ?? s;
}

export function fieldsFromForm(schemaJson: Record<string, unknown>, layoutJson: Record<string, unknown>): FormFieldDef[] {
  const schema = schemaJson as JsonSchema;
  const layout = layoutJson as LayoutJson;
  const groupOf: Record<string, string> = {};
  for (const g of layout.groups ?? []) {
    for (const f of g.fields ?? []) groupOf[f] = g.key;
  }
  return Object.entries(schema.properties ?? {}).map(([name, raw]) => {
    const field: FormFieldDef = {
      name,
      title: String(raw.title ?? name),
      type: (raw.type as FormFieldDef["type"]) ?? "string",
      component: String(raw.component ?? (raw as { "x-component"?: string })["x-component"] ?? "Input"),
      required: (schema.required ?? []).includes(name),
      placeholder: raw.placeholder as string | undefined,
      group: groupOf[name] ?? "basic",
      options: raw.options as FieldOption[] | undefined,
      validations: raw.validations as FormFieldDef["validations"],
      defaultValue: raw.default,
      itemFields: (raw.itemFields as FormFieldDef[] | undefined) ?? undefined,
    };
    if (isChoiceComponent(field.component)) {
      field.options = resolveFieldOptions({ ...field, enum: raw.enum });
    }
    return field;
  });
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
      options: isChoiceComponent(f.component) ? resolveFieldOptions(f) : f.options?.filter((o) => (o.label ?? "").trim() || (o.value ?? "").trim()),
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
