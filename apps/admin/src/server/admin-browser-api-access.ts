import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { isCanonicalCoreWorkspaceId } from "@markorbit/persistence/core-workspace-bindings";
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
import {
  assertKnowledgeWorkspaceResource,
  resolveCoreWorkspaceIdForKnowledgeWorkspace,
  resolveKnowledgeWorkspaceAuthority,
  type KnowledgeWorkspaceAuthority,
  type KnowledgeWorkspaceAuthorityOptions,
} from "./knowledge-workspace-authority";

export type AdminBrowserApiAccess = KnowledgeWorkspaceAuthority;
export type AdminBrowserApiAccessOptions = AdminBrowserSessionOptions &
  KnowledgeWorkspaceAuthorityOptions;

function normalizedWorkspaceId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function requestForWorkspaceResolution(
  request: Request,
  assertedWorkspaceId: string | undefined,
  options: AdminBrowserApiAccessOptions,
): Request {
  const headerWorkspaceId = normalizedWorkspaceId(request.headers.get(ADMIN_WORKSPACE_HEADER));
  const assertion = normalizedWorkspaceId(assertedWorkspaceId);
  const assertionCoreWorkspaceId = assertion
    ? isCanonicalCoreWorkspaceId(assertion)
      ? assertion.toLowerCase()
      : assertion === DEFAULT_WORKSPACE.id || headerWorkspaceId
        ? undefined
        : resolveCoreWorkspaceIdForKnowledgeWorkspace(assertion, options)
    : undefined;

  if (
    headerWorkspaceId &&
    assertionCoreWorkspaceId &&
    headerWorkspaceId.toLowerCase() !== assertionCoreWorkspaceId
  ) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace assertion does not match the requested Core workspace.",
    );
  }

  const headers = new Headers(request.headers);
  if (!headerWorkspaceId && assertionCoreWorkspaceId) {
    headers.set(ADMIN_WORKSPACE_HEADER, assertionCoreWorkspaceId);
  }
  return new Request(request.url, { method: request.method, headers });
}

export async function resolveAdminBrowserApiReadAccess(
  request: Request,
  assertedWorkspaceId?: string,
  options: AdminBrowserApiAccessOptions = {},
): Promise<AdminBrowserApiAccess> {
  const assertion = normalizedWorkspaceId(assertedWorkspaceId);
  const principal = await resolveAdminBrowserWorkspacePrincipal(
    requestForWorkspaceResolution(request, assertion, options),
    options,
  );
  return resolveKnowledgeWorkspaceAuthority(principal, assertion, {
    ...options,
    allowExplicitGlobalPublicScope: true,
  });
}

export async function resolveAdminBrowserApiMutationAccess(
  request: Request,
  assertedWorkspaceId?: string,
  options: AdminBrowserApiAccessOptions = {},
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
  options: AdminBrowserApiAccessOptions = {},
): void {
  const authority = resolveKnowledgeWorkspaceAuthority(principal, resourceWorkspaceId, {
    ...options,
    allowExplicitGlobalPublicScope: true,
  });
  assertKnowledgeWorkspaceResource(authority, resourceWorkspaceId);
}
