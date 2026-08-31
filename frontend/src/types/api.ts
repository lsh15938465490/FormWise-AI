export type ApiResult<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

export type FormEntity = {
  id: string;
  name: string;
  description?: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  schemaJson: Record<string, unknown>;
  dataModelJson: Record<string, unknown>;
  linkageJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
  visibleRoleCodes?: string[];
  updatedAt: string;
};

export type WorkflowEntity = {
  id: string;
  name: string;
  status: string;
  formId?: string | null;
  definitionJson: {
    nodes: {
      id: string;
      type: string;
      name: string;
      assigneeRole?: string;
      timeoutHours?: number;
      rejectRule?: string;
      x?: number;
      y?: number;
    }[];
    edges: { source: string; target: string; condition?: string }[];
  };
};

export type PluginEntity = {
  id: string;
  type: "FORM_COMPONENT" | "WORKFLOW_NODE";
  code: string;
  name: string;
  enabled: boolean;
};
