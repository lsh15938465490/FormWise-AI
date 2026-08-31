import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { DashboardPage } from "@/pages/dashboard-page";
import { FormBuilderPage } from "@/pages/form-builder-page";
import { FormListPage } from "@/pages/form-list-page";
import { FormSubmitPage } from "@/pages/form-submit-page";
import { LoginPage } from "@/pages/login-page";
import { MessagesPage } from "@/pages/messages-page";
import { PluginPage } from "@/pages/plugin-page";
import { RecordListPage } from "@/pages/record-list-page";
import { TaskPage } from "@/pages/task-page";
import { UsersPage } from "@/pages/users-page";
import { WorkflowDesignerPage } from "@/pages/workflow-designer-page";
import { WorkflowListPage } from "@/pages/workflow-list-page";
import { WorkflowTracePage } from "@/pages/workflow-trace-page";
import { useAuthStore } from "@/stores/auth-store";

function Guard() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Guard />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/forms" element={<FormListPage />} />
          <Route path="/forms/builder" element={<FormBuilderPage />} />
          <Route path="/forms/:id/submit" element={<FormSubmitPage />} />
          <Route path="/workflows" element={<WorkflowListPage />} />
          <Route path="/workflows/designer" element={<WorkflowDesignerPage />} />
          <Route path="/workflows/trace" element={<WorkflowTracePage />} />
          <Route path="/records" element={<RecordListPage />} />
          <Route path="/tasks" element={<TaskPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/plugins" element={<PluginPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
