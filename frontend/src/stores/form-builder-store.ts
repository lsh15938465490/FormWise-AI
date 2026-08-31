import { create } from "zustand";
import type { FormEntity } from "@/types/api";
import type { FormFieldDef, LinkageJson } from "@/lib/form-schema";

type FormBuilderState = {
  prompt: string;
  form: FormEntity | null;
  fields: FormFieldDef[];
  linkage: LinkageJson;
  selectedField: string | null;
  values: Record<string, unknown>;
  dirty: boolean;
  setPrompt: (prompt: string) => void;
  setForm: (form: FormEntity | null, fields?: FormFieldDef[], linkage?: LinkageJson) => void;
  setFields: (fields: FormFieldDef[]) => void;
  setLinkage: (linkage: LinkageJson) => void;
  setSelectedField: (name: string | null) => void;
  setValue: (name: string, value: unknown) => void;
  setDirty: (dirty: boolean) => void;
};

export const useFormBuilderStore = create<FormBuilderState>((set) => ({
  prompt: "搭建员工请假审批表，包含姓名、部门、岗位、请假类型、请假时长、请假原因，部门变更联动岗位选项，时长必填且大于0",
  form: null,
  fields: [],
  linkage: { rules: [] },
  selectedField: null,
  values: {},
  dirty: false,
  setPrompt: (prompt) => set({ prompt }),
  setForm: (form, fields = [], linkage = { rules: [] }) =>
    set({ form, fields, linkage, values: {}, selectedField: fields[0]?.name ?? null, dirty: false }),
  setFields: (fields) => set({ fields, dirty: true }),
  setLinkage: (linkage) => set({ linkage, dirty: true }),
  setSelectedField: (selectedField) => set({ selectedField }),
  setValue: (name, value) => set((s) => ({ values: { ...s.values, [name]: value } })),
  setDirty: (dirty) => set({ dirty }),
}));
