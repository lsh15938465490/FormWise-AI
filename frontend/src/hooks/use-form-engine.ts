import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { schemaToZod } from "@/lib/schema-to-zod";

/** 统一表单状态：值、校验、提交中。预览和填写都走这里，不要各写一套。 */
export function useFormEngine(
  schemaJson: Record<string, unknown>,
  layoutJson: Record<string, unknown>,
  defaultValues?: Record<string, unknown>,
) {
  const zodSchema = useMemo(() => schemaToZod(schemaJson, layoutJson), [schemaJson, layoutJson]);
  const methods = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: (defaultValues ?? {}) as Record<string, string>,
    shouldFocusError: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const values = methods.watch() as Record<string, unknown>;
  const { errors: formErrors, submitCount } = methods.formState;
  const errors = Object.fromEntries(
    Object.entries(formErrors).map(([k, v]) => [k, String((v as { message?: string })?.message ?? "校验失败")]),
  );
  return { methods, values, errors, submitting, setSubmitting, submitCount };
}
