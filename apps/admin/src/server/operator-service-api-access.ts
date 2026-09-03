import {
  authenticateCaseProducerRequest,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";

function assertWorkspace(
  principal: CaseProducerWorkspacePrincipalV1,
  assertedWorkspaceId?: string | null,
): void {
  if (assertedWorkspaceId && assertedWorkspaceId !== principal.workspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the operator-service workspace assertion.",
    );
  }
}

export function resolveOperatorServiceReadAccess(
  request: Request,
  assertedWorkspaceId?: string | null,
): CaseProducerWorkspacePrincipalV1 {
  const principal = authenticateCaseProducerRequest(request);
  assertWorkspace(principal, assertedWorkspaceId);
  return principal;
}

export function resolveOperatorServiceMutationAccess(
  request: Request,
  assertedWorkspaceId?: string | null,
): CaseProducerWorkspacePrincipalV1 {
  const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate operator-service state.",
    );
  }
  return principal;
}
