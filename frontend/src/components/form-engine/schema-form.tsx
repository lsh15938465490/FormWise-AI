import { FormFieldCanvas } from "@/components/form-engine/form-field-canvas";
import { useFormEngine } from "@/hooks/use-form-engine";
import { Button } from "@/components/ui/button";

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

  return (
    <form
      className="space-y-6"
      onSubmit={methods.handleSubmit(async (data) => {
        setSubmitting(true);
        try {
          await onSubmit?.(data);
        } finally {
          setSubmitting(false);
        }
      })}
    >
      <FormFieldCanvas
        schemaJson={schemaJson}
        layoutJson={layoutJson}
        linkageJson={linkageJson}
        values={values}
        errors={errors}
        onChange={(name, v) => methods.setValue(name, v as never, { shouldValidate: true })}
      />
      {onSubmit ? (
        <Button type="submit" disabled={submitting}>
          {submitting ? "提交中..." : submitText}
        </Button>
      ) : null}
    </form>
  );
}
