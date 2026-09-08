import { CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY } from "@markorbit/contracts";
import {
  ControlPlaneOwnerAccessError,
  CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER,
  CONTROL_PLANE_OWNER_PRINCIPAL_HEADER,
} from "./control-plane-owner-auth";

export type ControlPlaneKnowledgePlatformReadPrincipalV1 = {
  kind: "CONTROL_PLANE_KNOWLEDGE_PLATFORM_READ";
  caller: "MARKORBIT_GATEWAY";
  authority: typeof CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY;
  expiresAt: string;
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalidPrincipal(): never {
  throw new ControlPlaneOwnerAccessError(
    "AUTHENTICATION_REQUIRED",
    401,
    "Control Plane platform owner principal is invalid.",
  );
}
function parsePlatformPrincipal(
  value: string | null,
  now: Date,
): ControlPlaneKnowledgePlatformReadPrincipalV1 {
  if (!value) invalidPrincipal();

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    invalidPrincipal();
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) invalidPrincipal();

  const envelope = decoded as Record<string, unknown>;
  const principalValue = envelope.principal;
  if (
    envelope.schemaVersion !== 1 ||
    typeof principalValue !== "object" ||
    principalValue === null ||
    Array.isArray(principalValue)
  )
    invalidPrincipal();

  const principal = principalValue as Record<string, unknown>;
  if (
    principal.kind !== "CONTROL_PLANE_KNOWLEDGE_PLATFORM_READ" ||
    principal.caller !== "MARKORBIT_GATEWAY" ||
    !nonEmpty(principal.expiresAt) ||
    "workspaceId" in principal
  )
    invalidPrincipal();

  if (principal.authority !== CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY) {
    throw new ControlPlaneOwnerAccessError(
      "PERMISSION_DENIED",
      403,
      `${CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY} authority is required.`,
    );
  }

  const expiresAt = Date.parse(principal.expiresAt);
  if (!Number.isFinite(expiresAt)) invalidPrincipal();
  if (expiresAt <= now.getTime()) {
    throw new ControlPlaneOwnerAccessError(
      "SESSION_EXPIRED",
      401,
      "Control Plane platform owner principal has expired.",
    );
  }

  return {
    kind: "CONTROL_PLANE_KNOWLEDGE_PLATFORM_READ",
    caller: "MARKORBIT_GATEWAY",
    authority: CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
    expiresAt: principal.expiresAt,
  };
}

export function authenticateControlPlanePlatformOwnerReadRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
  now = new Date(),
): ControlPlaneKnowledgePlatformReadPrincipalV1 {
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
  return parsePlatformPrincipal(request.headers.get(CONTROL_PLANE_OWNER_PRINCIPAL_HEADER), now);
}
