import {
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import {
  ADMIN_WORKSPACE_HEADER,
  resolveAdminBrowserWorkspacePrincipal,
  validateAdminBrowserMutation,
  type AdminBrowserSessionOptions,
} from "./admin-browser-session";

export type AdminBrowserApiAccess = {
  principal: CaseProducerWorkspacePrincipalV1;
  workspaceId: string;
};

function normalizedWorkspaceId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requestForWorkspaceResolution(request: Request, assertedWorkspaceId?: string): Request {
  const headerWorkspaceId = normalizedWorkspaceId(request.headers.get(ADMIN_WORKSPACE_HEADER));
  const assertion = normalizedWorkspaceId(assertedWorkspaceId);
  if (headerWorkspaceId && assertion && headerWorkspaceId !== assertion) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace assertion does not match the requested Admin workspace.",
    );
  }

  const headers = new Headers(request.headers);
  if (!headerWorkspaceId && assertion) headers.set(ADMIN_WORKSPACE_HEADER, assertion);
  return new Request(request.url, { method: request.method, headers });
}

export async function resolveAdminBrowserApiReadAccess(
  request: Request,
  assertedWorkspaceId?: string,
  options: AdminBrowserSessionOptions = {},
): Promise<AdminBrowserApiAccess> {
  const assertion = normalizedWorkspaceId(assertedWorkspaceId);
  const principal = await resolveAdminBrowserWorkspacePrincipal(
    requestForWorkspaceResolution(request, assertion),
    options,
  );
  if (assertion && principal.workspaceId !== assertion) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the requested Admin workspace.",
    );
  }
  return { principal, workspaceId: principal.workspaceId };
}

export async function resolveAdminBrowserApiMutationAccess(
  request: Request,
  assertedWorkspaceId?: string,
  options: AdminBrowserSessionOptions = {},
): Promise<AdminBrowserApiAccess> {
  const access = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId, options);
  validateAdminBrowserMutation(request, access.principal, options);
  if (access.principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "Read-only Workspace membership cannot mutate Knowledge Admin state.",
    );
  }
  return access;
}

export function assertAdminBrowserResourceWorkspace(
  principal: CaseProducerWorkspacePrincipalV1,
  resourceWorkspaceId: string,
): void {
  if (principal.workspaceId !== resourceWorkspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the requested Admin resource.",
    );
  }
}
