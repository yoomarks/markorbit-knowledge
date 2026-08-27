import {
  authenticateCaseProducerRequest,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";

export function authorizeKnowledgeRelationshipRequest(
  request: Request,
  workspaceId: string,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
  now = new Date(),
): CaseProducerWorkspacePrincipalV1 {
  const principal = authenticateCaseProducerRequest(request, internalServiceSecret, now);
  if (principal.workspaceId !== workspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the Knowledge relationship workspace.",
    );
  }
  return principal;
}
