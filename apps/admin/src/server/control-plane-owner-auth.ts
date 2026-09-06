import { CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY } from "@markorbit/contracts";

export const CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER =
  "x-markorbit-internal-authorization" as const;
export const CONTROL_PLANE_OWNER_PRINCIPAL_HEADER = "x-markorbit-control-plane-principal" as const;

export type ControlPlaneKnowledgeReadPrincipalV1 = {
  kind: "CONTROL_PLANE_KNOWLEDGE_READ";
  caller: "MARKORBIT_GATEWAY";
  workspaceId: string;
  authority: typeof CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY;
  expiresAt: string;
};

export class ControlPlaneOwnerAccessError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ControlPlaneOwnerAccessError";
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function parsePrincipal(value: string | null, now: Date): ControlPlaneKnowledgeReadPrincipalV1 {
  if (!value) {
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal is required.",
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal is invalid.",
    );
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal is invalid.",
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
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal is invalid.",
    );
  }

  const principal = principalValue as Record<string, unknown>;
  if (
    principal.kind !== "CONTROL_PLANE_KNOWLEDGE_READ" ||
    principal.caller !== "MARKORBIT_GATEWAY" ||
    !nonEmpty(principal.workspaceId) ||
    !nonEmpty(principal.expiresAt)
  ) {
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal is invalid.",
    );
  }
  if (principal.authority !== CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY) {
    throw new ControlPlaneOwnerAccessError(
      "PERMISSION_DENIED",
      403,
      `${CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY} authority is required.`,
    );
  }

  const expiresAt = Date.parse(principal.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    throw new ControlPlaneOwnerAccessError(
      "AUTHENTICATION_REQUIRED",
      401,
      "Control Plane owner principal expiry is invalid.",
    );
  }
  if (expiresAt <= now.getTime()) {
    throw new ControlPlaneOwnerAccessError(
      "SESSION_EXPIRED",
      401,
      "Control Plane owner principal has expired.",
    );
  }

  return {
    kind: "CONTROL_PLANE_KNOWLEDGE_READ",
    caller: "MARKORBIT_GATEWAY",
    workspaceId: principal.workspaceId.trim(),
    authority: CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
    expiresAt: principal.expiresAt,
  };
}

export function authenticateControlPlaneOwnerReadRequest(
  request: Request,
  assertedWorkspaceId?: string | null,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
  now = new Date(),
): ControlPlaneKnowledgeReadPrincipalV1 {
  if (!internalServiceSecret) {
    throw new ControlPlaneOwnerAccessError(
      "CONTROL_PLANE_OWNER_AUTH_NOT_CONFIGURED",
      503,
      "Control Plane owner authentication is not configured.",
    );
  }
  if (
    request.headers.get(CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER) !== internalServiceSecret
  ) {
    throw new ControlPlaneOwnerAccessError(
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
      "Internal service authentication is required.",
    );
  }

  const principal = parsePrincipal(request.headers.get(CONTROL_PLANE_OWNER_PRINCIPAL_HEADER), now);
  const assertion = assertedWorkspaceId?.trim();
  if (assertion && assertion !== principal.workspaceId) {
    throw new ControlPlaneOwnerAccessError(
      "WORKSPACE_MISMATCH",
      403,
      "Control Plane owner principal does not match the requested workspace.",
    );
  }
  return principal;
}
