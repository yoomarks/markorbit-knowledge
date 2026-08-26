import { SqliteExpertTaskWorkspaceBindingRepository } from "@markorbit/persistence/expert-task-workspace-bindings";
import {
  authenticateCaseProducerRequest,
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import {
  resolveAdminBrowserWorkspacePrincipal,
  validateAdminBrowserMutation,
  type AdminBrowserSessionOptions,
} from "./admin-browser-session";
import { getRegistryDatabase } from "./source-registry";

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
  browserOptions: AdminBrowserSessionOptions = {},
): Promise<CaseProducerWorkspacePrincipalV1> {
  if (hasInternalPrincipalHeaders(request)) return authenticateExpertReadRequest(request);
  return resolveAdminBrowserWorkspacePrincipal(request, browserOptions);
}

export async function resolveExpertMutationPrincipal(
  request: Request,
  browserOptions: AdminBrowserSessionOptions = {},
): Promise<CaseProducerWorkspacePrincipalV1> {
  if (hasInternalPrincipalHeaders(request)) return authenticateExpertMutationRequest(request);
  const principal = await resolveAdminBrowserWorkspacePrincipal(request, browserOptions);
  validateAdminBrowserMutation(request, principal, browserOptions);
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate Expert tasks.",
    );
  }
  return principal;
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
      "Workspace Principal does not match the Expert task workspace.",
    );
  }
}

export function listExpertTaskIdsForWorkspace(workspaceId: string): string[] {
  return bindings().listTaskIds(workspaceId);
}
