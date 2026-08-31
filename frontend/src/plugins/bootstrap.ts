import {
  CheckboxWidget,
  DatePickerWidget,
  InputWidget,
  NumberInputWidget,
  RadioWidget,
  SelectWidget,
  SubFormWidget,
  TextareaWidget,
  UploadWidget,
} from "@/plugins/form-widgets";
import { registerFormWidget, registerWorkflowNode } from "@/plugins/registry";

export function bootstrapPlugins() {
  registerFormWidget("Input", InputWidget);
  registerFormWidget("Textarea", TextareaWidget);
  registerFormWidget("Select", SelectWidget);
  registerFormWidget("NumberInput", NumberInputWidget);
  registerFormWidget("DatePicker", DatePickerWidget);
  registerFormWidget("Upload", UploadWidget);
  registerFormWidget("Radio", RadioWidget);
  registerFormWidget("Checkbox", CheckboxWidget);
  registerFormWidget("SubForm", SubFormWidget);

  registerWorkflowNode({ type: "start", label: "发起节点", color: "#16a34a" });
  registerWorkflowNode({ type: "approve", label: "审批节点", color: "#2563eb" });
  registerWorkflowNode({ type: "cc", label: "抄送节点", color: "#7c3aed" });
  registerWorkflowNode({ type: "notify", label: "通知节点", color: "#ca8a04" });
  registerWorkflowNode({ type: "condition", label: "条件分支", color: "#ea580c" });
  registerWorkflowNode({ type: "end", label: "结束节点", color: "#64748b" });
}
