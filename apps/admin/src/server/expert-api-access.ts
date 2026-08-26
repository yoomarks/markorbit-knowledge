import { SqliteExpertTaskWorkspaceBindingRepository } from "@markorbit/persistence/expert-task-workspace-bindings";
import {
  authenticateCaseProducerRequest,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
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
