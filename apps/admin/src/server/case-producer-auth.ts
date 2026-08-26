import type { CaseCandidateV1 } from "@markorbit/contracts";

export const CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER =
  "x-markorbit-internal-authorization" as const;
export const CASE_PRODUCER_PRINCIPAL_HEADER = "x-markorbit-principal" as const;
export const CASE_PRODUCER_REQUIRED_PERMISSION = "matter:read" as const;

const WORKSPACE_ROLES = new Set(["WORKSPACE_ADMIN", "MATTER_MANAGER", "REVIEWER", "READ_ONLY"]);
const WORKSPACE_PERMISSIONS = new Set([
  "workspace:read",
  "workspace:manage",
  "membership:read",
  "membership:manage",
  "matter:read",
  "matter:create",
  "matter:manage",
  "matter:promote-knowledge",
  "order:create",
  "order:read",
  "order:update",
  "order:confirm",
  "order:matter:create",
  "order:cancel",
  "order:audit:read",
  "review:read",
  "review:perform",
  "execution:read",
  "execution:manage",
  "document-package:read",
  "document-package:prepare",
  "instruction-ledger:read",
  "instruction-ledger:write",
  "document-package:mark-ready",
  "audit:read",
]);

export type CaseProducerWorkspacePrincipalV1 = {
  kind: "WORKSPACE";
  sessionId: string;
  userId: string;
  workspaceId: string;
  membershipId: string;
  role: string;
  permissions: readonly string[];
  sessionExpiresAt: string;
};

export class CaseProducerAccessError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "CaseProducerAccessError";
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseWorkspacePrincipal(
  value: string | null,
  now: Date,
): CaseProducerWorkspacePrincipalV1 {
  if (!value) {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal is required.",
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal is invalid.",
    );
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal is invalid.",
    );
  }

  const envelope = decoded as Record<string, unknown>;
  const principalValue = envelope.principal;
  if (
    envelope.schemaVersion !== 1 ||
    typeof principalValue !== "object" ||
    principalValue === null ||
    Array.isArray(principalValue)
  ) {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal is invalid.",
    );
  }

  const principal = principalValue as Record<string, unknown>;
  const permissions = principal.permissions;
  if (
    principal.kind !== "WORKSPACE" ||
    !nonEmpty(principal.sessionId) ||
    !nonEmpty(principal.userId) ||
    !nonEmpty(principal.workspaceId) ||
    !nonEmpty(principal.membershipId) ||
    !nonEmpty(principal.role) ||
    !WORKSPACE_ROLES.has(principal.role) ||
    !Array.isArray(permissions) ||
    permissions.some(
      (permission) => !nonEmpty(permission) || !WORKSPACE_PERMISSIONS.has(permission),
    ) ||
    !nonEmpty(principal.sessionExpiresAt)
  ) {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal is invalid.",
    );
  }

  const sessionExpiresAt = Date.parse(principal.sessionExpiresAt);
  if (Number.isNaN(sessionExpiresAt)) {
    throw new CaseProducerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Workspace Principal session expiry is invalid.",
    );
  }
  if (sessionExpiresAt <= now.getTime()) {
    throw new CaseProducerAccessError(
      "SESSION_EXPIRED",
      401,
      "Workspace Principal session has expired.",
    );
  }

  return {
    kind: "WORKSPACE",
    sessionId: principal.sessionId,
    userId: principal.userId,
    workspaceId: principal.workspaceId,
    membershipId: principal.membershipId,
    role: principal.role,
    permissions: [...permissions] as string[],
    sessionExpiresAt: principal.sessionExpiresAt,
  };
}

export function authenticateCaseProducerRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
  now = new Date(),
): CaseProducerWorkspacePrincipalV1 {
  if (!internalServiceSecret) {
    throw new CaseProducerAccessError(
      "CASE_PRODUCER_AUTH_NOT_CONFIGURED",
      503,
      "Case producer internal service authentication is not configured.",
    );
  }

  if (request.headers.get(CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER) !== internalServiceSecret) {
    throw new CaseProducerAccessError(
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
      "Internal service authentication is required.",
    );
  }

  const principal = parseWorkspacePrincipal(
    request.headers.get(CASE_PRODUCER_PRINCIPAL_HEADER),
    now,
  );
  if (!principal.permissions.includes(CASE_PRODUCER_REQUIRED_PERMISSION)) {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      `${CASE_PRODUCER_REQUIRED_PERMISSION} permission is required.`,
    );
  }
  return principal;
}

export function authorizeCaseProducerWorkspace(
  principal: CaseProducerWorkspacePrincipalV1,
  candidate: CaseCandidateV1,
): void {
  if (principal.workspaceId !== candidate.accessScope.sourceWorkspaceId) {
    throw new CaseProducerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Workspace Principal does not match the Case Candidate source workspace.",
    );
  }
}

export function authorizeCaseProducerRequest(
  request: Request,
  candidate: CaseCandidateV1,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
  now = new Date(),
): CaseProducerWorkspacePrincipalV1 {
  const principal = authenticateCaseProducerRequest(request, internalServiceSecret, now);
  authorizeCaseProducerWorkspace(principal, candidate);
  return principal;
}
