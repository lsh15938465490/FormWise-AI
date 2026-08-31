import { FormFieldCanvas } from "@/components/form-engine/form-field-canvas";
import { useFormBuilderStore } from "@/stores/form-builder-store";

export function DynamicFormRenderer({
  schemaJson,
  layoutJson,
  linkageJson,
}: {
  schemaJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  linkageJson?: Record<string, unknown>;
}) {
  const values = useFormBuilderStore((s) => s.values);
  const setValue = useFormBuilderStore((s) => s.setValue);
  const storeLinkage = useFormBuilderStore((s) => s.linkage);
  const linkage = linkageJson ?? storeLinkage;
  return (
    <FormFieldCanvas
      schemaJson={schemaJson}
      layoutJson={layoutJson}
      linkageJson={linkage}
      values={values}
      onChange={setValue}
    />
  );
}
