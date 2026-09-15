import { useRef, useState } from "react";
import { FormFieldCanvas } from "@/components/form-engine/form-field-canvas";
import { useFormEngine } from "@/hooks/use-form-engine";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/lib/err-msg";

function scrollFirstErrorIntoView(root: HTMLElement, names: string[]) {
  const nameSet = new Set(names);
  const target = [...root.querySelectorAll<HTMLElement>("[data-form-field]")].find((el) => {
    const name = el.getAttribute("data-form-field");
    return Boolean(name && nameSet.has(name));
  });
  if (!target) return;
  const hint = target.querySelector<HTMLElement>("[data-field-error]") ?? target;
  const rootRect = root.getBoundingClientRect();
  const hintRect = hint.getBoundingClientRect();
  const pad = 16;
  if (hintRect.bottom > rootRect.bottom - pad) {
    root.scrollTo({ top: root.scrollTop + (hintRect.bottom - rootRect.bottom) + pad, behavior: "smooth" });
  } else if (hintRect.top < rootRect.top + pad) {
    root.scrollTo({ top: root.scrollTop + (hintRect.top - rootRect.top) - pad, behavior: "smooth" });
  }
}

export function SchemaForm({
  schemaJson,
  layoutJson,
  linkageJson,
  defaultValues,
  onSubmit,
  submitText = "提交",
}: {
  schemaJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  linkageJson?: Record<string, unknown>;
  defaultValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => Promise<void> | void;
  submitText?: string;
}) {
  const { methods, values, errors, submitting, setSubmitting } = useFormEngine(schemaJson, layoutJson, defaultValues);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [submitError, setSubmitError] = useState("");
  const firstError = Object.values(errors)[0];

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={methods.handleSubmit(
        async (data) => {
          setSubmitting(true);
          setSubmitError("");
          try {
            await onSubmit?.(data);
          } catch (err) {
            setSubmitError(errMsg(err, "提交失败"));
          } finally {
            setSubmitting(false);
          }
        },
        (fieldErrors) => {
          const names = Object.keys(fieldErrors);
          const first = names[0] ? String((fieldErrors[names[0]] as { message?: string })?.message ?? "") : "";
          setSubmitError(first || "请检查必填项");
          window.setTimeout(() => {
            if (scrollRef.current) scrollFirstErrorIntoView(scrollRef.current, names);
          }, 50);
        },
      )}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-6">
        <FormFieldCanvas
          schemaJson={schemaJson}
          layoutJson={layoutJson}
          linkageJson={linkageJson}
          values={values}
          errors={errors}
          onChange={(name, v) => methods.setValue(name, v as never, { shouldValidate: true, shouldDirty: true })}
        />
      </div>
      {onSubmit ? (
        <div className="shrink-0 space-y-2 border-t border-border bg-white pt-4">
          {submitError || firstError ? (
            <p className="text-sm text-destructive">{submitError || firstError}</p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "提交中..." : submitText}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
