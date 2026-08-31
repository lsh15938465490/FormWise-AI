import type { ComponentType } from "react";

export type FormFieldMeta = {
  name: string;
  title?: string;
  type?: string;
  component?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
};

export type FormWidgetProps = {
  field: FormFieldMeta;
  value: unknown;
  onChange: (value: unknown) => void;
  allValues?: Record<string, unknown>;
};

export type WorkflowNodeMeta = {
  type: string;
  label: string;
  color: string;
};

type Registry = {
  formWidgets: Record<string, ComponentType<FormWidgetProps>>;
  workflowNodes: Record<string, WorkflowNodeMeta>;
};

const registry: Registry = { formWidgets: {}, workflowNodes: {} };
const builtins: Registry = { formWidgets: {}, workflowNodes: {} };

export function registerFormWidget(code: string, widget: ComponentType<FormWidgetProps>) {
  registry.formWidgets[code] = widget;
  builtins.formWidgets[code] = widget;
}

export function registerWorkflowNode(meta: WorkflowNodeMeta) {
  registry.workflowNodes[meta.type] = meta;
  builtins.workflowNodes[meta.type] = meta;
}

export function syncEnabledPlugins(enabledCodes: string[]) {
  const allow = new Set(enabledCodes);
  registry.formWidgets = {};
  registry.workflowNodes = {};
  for (const [code, widget] of Object.entries(builtins.formWidgets)) {
    if (!allow.size || allow.has(code)) registry.formWidgets[code] = widget;
  }
  for (const [code, meta] of Object.entries(builtins.workflowNodes)) {
    if (!allow.size || allow.has(code)) registry.workflowNodes[code] = meta;
  }
}

export function getFormWidget(code?: string) {
  return registry.formWidgets[code ?? "Input"] ?? registry.formWidgets.Input ?? Object.values(registry.formWidgets)[0];
}

export function getWorkflowNodes() {
  return Object.values(registry.workflowNodes);
}

export function getRegistrySnapshot() {
  return {
    formWidgets: Object.keys(registry.formWidgets),
    workflowNodes: Object.keys(registry.workflowNodes),
  };
}
