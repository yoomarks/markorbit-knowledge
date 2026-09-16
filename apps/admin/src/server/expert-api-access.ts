import { SqliteExpertTaskWorkspaceBindingRepository } from "@markorbit/persistence/expert-task-workspace-bindings";
import {
  authenticateCaseProducerRequest,
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
  type AdminBrowserApiAccessOptions,
} from "./admin-browser-api-access";
import {
  resolveKnowledgeWorkspaceAuthority,
  type KnowledgeWorkspaceAuthority,
} from "./knowledge-workspace-authority";
import { getRegistryDatabase } from "./source-registry";

export type ExpertAccessOptions = AdminBrowserApiAccessOptions & {
  internalServiceSecret?: string;
};

export function authenticateExpertReadRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): CaseProducerWorkspacePrincipalV1 {
  return authenticateCaseProducerRequest(request, internalServiceSecret);
}
export function authenticateExpertMutationRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): CaseProducerWorkspacePrincipalV1 {
  const principal = authenticateExpertReadRequest(request, internalServiceSecret);
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate Expert tasks.",
    );
  }
  return principal;
}

function hasInternalPrincipalHeaders(request: Request): boolean {
  return (
    request.headers.has(CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER) ||
    request.headers.has(CASE_PRODUCER_PRINCIPAL_HEADER)
  );
}
export async function resolveExpertReadPrincipal(
  request: Request,
  options: ExpertAccessOptions = {},
): Promise<KnowledgeWorkspaceAuthority> {
  if (hasInternalPrincipalHeaders(request)) {
    const principal = authenticateExpertReadRequest(
      request,
      options.internalServiceSecret ?? process.env.MO_INTERNAL_SERVICE_SECRET,
    );
    return resolveKnowledgeWorkspaceAuthority(principal, undefined, options);
  }
  return resolveAdminBrowserApiReadAccess(request, undefined, options);
}

export async function resolveExpertMutationPrincipal(
  request: Request,
  options: ExpertAccessOptions = {},
): Promise<KnowledgeWorkspaceAuthority> {
  if (hasInternalPrincipalHeaders(request)) {
    const principal = authenticateExpertMutationRequest(
      request,
      options.internalServiceSecret ?? process.env.MO_INTERNAL_SERVICE_SECRET,
    );
    return resolveKnowledgeWorkspaceAuthority(principal, undefined, options);
  }
  return resolveAdminBrowserApiMutationAccess(request, undefined, options);
}
function bindings(): SqliteExpertTaskWorkspaceBindingRepository {
  return new SqliteExpertTaskWorkspaceBindingRepository(getRegistryDatabase());
}

export function bindExpertTaskWorkspace(taskId: string, workspaceId: string): void {
  bindings().bind(taskId, workspaceId);
}

export function authorizeExpertTaskWorkspace(taskId: string, workspaceId: string): void {
  const boundWorkspaceId = bindings().getWorkspaceId(taskId);
  if (!boundWorkspaceId) {
    throw new CaseProducerAccessError(
      "EXPERT_TASK_WORKSPACE_UNBOUND",
      403,
      "Expert task has no durable workspace binding and is inaccessible through the API.",
    );
  }
  if (boundWorkspaceId !== workspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace authority does not match the Expert task workspace.",
    );
  }
}
export function listExpertTaskIdsForWorkspace(workspaceId: string): string[] {
  return bindings().listTaskIds(workspaceId);
}
