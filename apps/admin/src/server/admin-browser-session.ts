import { createHmac, timingSafeEqual } from "node:crypto";
import {
  authenticateCaseProducerRequest,
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";

export const ADMIN_SESSION_COOKIE_NAME = "mo_session" as const;
export const ADMIN_WORKSPACE_HEADER = "x-markorbit-workspace-id" as const;
export const ADMIN_CSRF_HEADER = "x-markorbit-csrf-token" as const;

export type AdminWorkspaceOption = {
  workspaceId: string;
  name: string;
  role: string;
};

export type AdminBrowserSession = {
  authenticated: true;
  userId: string;
  sessionId: string;
  sessionExpiresAt: string;
  csrfToken: string;
  workspaces: AdminWorkspaceOption[];
};

export type AdminBrowserSessionOptions = {
  coreAuthUrl?: string;
  internalSecret?: string;
  csrfSecret?: string;
  allowedOrigins?: readonly string[];
  fetchImpl?: typeof fetch;
  now?: Date;
};

type StringRecord = Record<string, unknown>;

function record(value: unknown): StringRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as StringRecord)
    : null;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function fail(code: string, status: 401 | 403 | 503, message: string): never {
  throw new CaseProducerAccessError(code, status, message);
}

function coreBaseUrl(options: AdminBrowserSessionOptions): string {
  const configured = options.coreAuthUrl ?? process.env.MARKORBIT_CORE_AUTH_URL;
  const fallback = process.env.MARKORBIT_CORE_INTAKE_URL;
  const raw = configured?.trim() || fallback?.trim();
  if (!raw) {
    return fail(
      "ADMIN_SESSION_AUTH_NOT_CONFIGURED",
      503,
      "Core authentication endpoint is not configured.",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(
      "ADMIN_SESSION_AUTH_NOT_CONFIGURED",
      503,
      "Core authentication endpoint is invalid.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return fail(
      "ADMIN_SESSION_AUTH_NOT_CONFIGURED",
      503,
      "Core authentication endpoint must be an HTTP(S) URL without embedded credentials.",
    );
  }
  return url.origin;
}

function internalSecret(options: AdminBrowserSessionOptions): string {
  const secret = options.internalSecret ?? process.env.MARKORBIT_CORE_INTERNAL_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    return fail(
      "ADMIN_SESSION_AUTH_NOT_CONFIGURED",
      503,
      "Core internal authentication is not configured.",
    );
  }
  return secret;
}

function csrfSecret(options: AdminBrowserSessionOptions): string {
  const secret =
    options.csrfSecret ?? process.env.MARKORBIT_ADMIN_CSRF_SECRET ?? internalSecret(options);
  if (Buffer.byteLength(secret, "utf8") < 32) {
    return fail(
      "ADMIN_SESSION_CSRF_NOT_CONFIGURED",
      503,
      "Admin CSRF protection is not configured.",
    );
  }
  return secret;
}

function readCookie(request: Request): string {
  const cookie = request.headers.get("cookie");
  const token = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE_NAME}=`))
    ?.slice(ADMIN_SESSION_COOKIE_NAME.length + 1);
  if (!token) {
    return fail("AUTHENTICATION_REQUIRED", 401, "Admin browser authentication is required.");
  }
  return token;
}

function correlationHeaders(request: Request): Record<string, string> {
  const correlationId = request.headers.get("x-correlation-id")?.trim();
  return correlationId ? { "x-correlation-id": correlationId } : {};
}

function coreErrorCode(value: unknown): string | undefined {
  const body = record(value);
  return nonEmpty(body?.code) ? body.code : undefined;
}

async function coreRequest(
  request: Request,
  path: string,
  method: "GET" | "POST",
  body: unknown,
  options: AdminBrowserSessionOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${coreBaseUrl(options)}${path}`, {
      method,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        [CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER]: internalSecret(options),
        ...correlationHeaders(request),
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    return fail(
      "AUTHENTICATION_SERVICE_UNAVAILABLE",
      503,
      "Core authentication service is unavailable.",
    );
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    if (response.ok) {
      return fail(
        "AUTHENTICATION_SERVICE_UNAVAILABLE",
        503,
        "Core authentication response is invalid.",
      );
    }
  }

  if (!response.ok) {
    const code = coreErrorCode(responseBody) ?? "AUTHENTICATION_REQUIRED";
    if (response.status >= 500) {
      return fail(code, 503, "Core authentication service is unavailable.");
    }
    if (response.status === 401) {
      return fail(code, 401, "Admin browser session is invalid or expired.");
    }
    return fail(code, 403, "Workspace access is denied.");
  }
  return responseBody;
}

function authenticatedUser(value: unknown, now: Date) {
  const principal = record(value);
  if (
    principal?.kind !== "AUTHENTICATED_USER" ||
    !nonEmpty(principal.sessionId) ||
    !nonEmpty(principal.userId) ||
    !nonEmpty(principal.sessionExpiresAt)
  ) {
    return fail("AUTHENTICATION_REQUIRED", 401, "Core user Principal is invalid.");
  }
  const expiresAt = Date.parse(principal.sessionExpiresAt);
  if (Number.isNaN(expiresAt) || expiresAt <= now.getTime()) {
    return fail("SESSION_EXPIRED", 401, "Admin browser session has expired.");
  }
  return {
    sessionId: principal.sessionId,
    userId: principal.userId,
    sessionExpiresAt: principal.sessionExpiresAt,
  };
}

function workspaceOptions(value: unknown, userId: string): AdminWorkspaceOption[] {
  const body = record(value);
  if (!Array.isArray(body?.workspaces)) {
    return fail("AUTHENTICATION_REQUIRED", 401, "Core workspace response is invalid.");
  }
  return body.workspaces.flatMap((entryValue): AdminWorkspaceOption[] => {
    const entry = record(entryValue);
    const workspace = record(entry?.workspace);
    const membership = record(entry?.membership);
    if (
      !nonEmpty(workspace?.workspaceId) ||
      !nonEmpty(workspace?.name) ||
      workspace.status !== "ACTIVE" ||
      !nonEmpty(membership?.membershipId) ||
      membership.workspaceId !== workspace.workspaceId ||
      membership.userId !== userId ||
      membership.status !== "ACTIVE" ||
      !nonEmpty(membership.role)
    ) {
      return [];
    }
    return [
      {
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        role: membership.role,
      },
    ];
  });
}

function encodePrincipal(value: unknown): string {
  return Buffer.from(JSON.stringify({ schemaVersion: 1, principal: value }), "utf8").toString(
    "base64url",
  );
}

function validatedWorkspacePrincipal(
  value: unknown,
  requestedWorkspaceId: string,
  options: AdminBrowserSessionOptions,
): CaseProducerWorkspacePrincipalV1 {
  const secret = internalSecret(options);
  const synthetic = new Request("http://knowledge.internal/admin-session", {
    headers: {
      [CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER]: secret,
      [CASE_PRODUCER_PRINCIPAL_HEADER]: encodePrincipal(value),
    },
  });
  const principal = authenticateCaseProducerRequest(synthetic, secret, options.now ?? new Date());
  if (principal.workspaceId !== requestedWorkspaceId) {
    return fail("WORKSPACE_MISMATCH", 403, "Core Workspace Principal does not match the request.");
  }
  return principal;
}

function csrfToken(sessionId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`knowledge-admin-expert:${sessionId}`, "utf8")
    .digest("base64url");
}

function allowedOrigins(request: Request, options: AdminBrowserSessionOptions): readonly string[] {
  if (options.allowedOrigins) return options.allowedOrigins;
  const configured = (process.env.MARKORBIT_ADMIN_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length ? configured : [new URL(request.url).origin];
}

export async function resolveAdminBrowserSession(
  request: Request,
  options: AdminBrowserSessionOptions = {},
): Promise<AdminBrowserSession> {
  const token = readCookie(request);
  const now = options.now ?? new Date();
  const user = authenticatedUser(
    await coreRequest(request, "/internal/auth/sessions/resolve", "POST", { token }, options),
    now,
  );
  const workspaces = workspaceOptions(
    await coreRequest(
      request,
      `/internal/onboarding/users/${encodeURIComponent(user.userId)}/workspaces`,
      "GET",
      undefined,
      options,
    ),
    user.userId,
  );
  return {
    authenticated: true,
    ...user,
    csrfToken: csrfToken(user.sessionId, csrfSecret(options)),
    workspaces,
  };
}

export async function resolveAdminBrowserWorkspacePrincipal(
  request: Request,
  options: AdminBrowserSessionOptions = {},
): Promise<CaseProducerWorkspacePrincipalV1> {
  const workspaceId = request.headers.get(ADMIN_WORKSPACE_HEADER)?.trim();
  if (!workspaceId) {
    return fail("WORKSPACE_CONTEXT_REQUIRED", 403, "Workspace context is required.");
  }
  const token = readCookie(request);
  const value = await coreRequest(
    request,
    "/internal/auth/workspace-principals/resolve",
    "POST",
    { token, workspaceId },
    options,
  );
  return validatedWorkspacePrincipal(value, workspaceId, options);
}

export function validateAdminBrowserMutation(
  request: Request,
  principal: CaseProducerWorkspacePrincipalV1,
  options: AdminBrowserSessionOptions = {},
): void {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(request, options).includes(origin)) {
    return fail("UNTRUSTED_ORIGIN", 403, "Request origin is not trusted.");
  }
  const supplied = request.headers.get(ADMIN_CSRF_HEADER);
  if (!supplied) {
    return fail("INVALID_CSRF_TOKEN", 403, "CSRF token is invalid.");
  }
  const expected = Buffer.from(csrfToken(principal.sessionId, csrfSecret(options)), "utf8");
  const actual = Buffer.from(supplied, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return fail("INVALID_CSRF_TOKEN", 403, "CSRF token is invalid.");
  }
}
