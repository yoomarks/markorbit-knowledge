import {
  authenticateCaseProducerRequest,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import {
  assertKnowledgeWorkspaceResource,
  resolveKnowledgeWorkspaceAuthority,
  type KnowledgeWorkspaceAuthority,
  type KnowledgeWorkspaceAuthorityOptions,
} from "./knowledge-workspace-authority";

export type OperatorServiceAccess = KnowledgeWorkspaceAuthority;
export type OperatorServiceAccessOptions = KnowledgeWorkspaceAuthorityOptions & {
  internalServiceSecret?: string;
};

export function authenticateOperatorServicePrincipal(
  request: Request,
  options: OperatorServiceAccessOptions = {},
): CaseProducerWorkspacePrincipalV1 {
  return authenticateCaseProducerRequest(
    request,
    options.internalServiceSecret ?? process.env.MO_INTERNAL_SERVICE_SECRET,
  );
}
export function resolveOperatorServiceReadAccess(
  request: Request,
  assertedWorkspaceId?: string | null,
  options: OperatorServiceAccessOptions = {},
): OperatorServiceAccess {
  const principal = authenticateOperatorServicePrincipal(request, options);
  return resolveKnowledgeWorkspaceAuthority(principal, assertedWorkspaceId, options);
}

export function resolveOperatorServiceMutationAccess(
  request: Request,
  assertedWorkspaceId?: string | null,
  options: OperatorServiceAccessOptions = {},
): OperatorServiceAccess {
  const access = resolveOperatorServiceReadAccess(request, assertedWorkspaceId, options);
  if (access.principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate operator-service state.",
    );
  }
  return access;
}
export function assertOperatorServiceResourceWorkspace(
  access: OperatorServiceAccess,
  resourceWorkspaceId: string,
): void {
  assertKnowledgeWorkspaceResource(access, resourceWorkspaceId);
}

export function assertOperatorServiceWritablePrincipal(
  principal: CaseProducerWorkspacePrincipalV1,
): void {
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate operator-service state.",
    );
  }
}
