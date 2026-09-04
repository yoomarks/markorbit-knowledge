import process from "node:process";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authenticated calibration requests`);
  return value;
}

const originalFetch = globalThis.fetch.bind(globalThis);
const controlPlaneOrigin = new URL(requiredEnv("MARKORBIT_CONTROL_PLANE_URL")).origin;
const sessionToken = requiredEnv("MARKORBIT_CALIBRATION_SESSION_TOKEN");
const workspaceId = requiredEnv("MARKORBIT_CALIBRATION_WORKSPACE_ID");
const sessionId = requiredEnv("MARKORBIT_CALIBRATION_SESSION_ID");
const userId = requiredEnv("MARKORBIT_CALIBRATION_USER_ID");
const membershipId = requiredEnv("MARKORBIT_CALIBRATION_MEMBERSHIP_ID");
const internalSecret = requiredEnv("MO_INTERNAL_SERVICE_SECRET");
const sessionExpiresAt = "2099-01-01T00:00:00.000Z";

let browserSessionPromise;

function inputUrl(input) {
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

function inputMethod(input, init) {
  return String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function requestHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  }
  return headers;
}

async function browserSession() {
  browserSessionPromise ??= (async () => {
    const response = await originalFetch(`${controlPlaneOrigin}/api/admin-session`, {
      headers: { cookie: `mo_session=${sessionToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      throw new Error(`Calibration Admin session bootstrap failed ${response.status}: ${text}`);
    }
    if (
      body?.authenticated !== true ||
      typeof body.csrfToken !== "string" ||
      body.userId !== userId ||
      body.sessionId !== sessionId ||
      !Array.isArray(body.workspaces) ||
      !body.workspaces.some((workspace) => workspace?.workspaceId === workspaceId)
    ) {
      throw new Error("Calibration Admin session bootstrap returned an unexpected principal");
    }
    return body;
  })();
  return browserSessionPromise;
}

function operatorPrincipalHeader() {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId,
        userId,
        workspaceId,
        membershipId,
        role: "WORKSPACE_ADMIN",
        permissions: ["matter:read"],
        sessionExpiresAt,
      },
    }),
    "utf8",
  ).toString("base64url");
}

function isOperatorOnlyPath(pathname) {
  return (
    pathname === "/api/conversion-runtime/capabilities" ||
    /^\/api\/raw-artifacts\/[^/]+\/source-graph$/.test(pathname) ||
    /^\/api\/runs\/[^/]+\/executions$/.test(pathname)
  );
}

function isWorkerMachinePath(pathname) {
  return pathname.startsWith("/api/worker/v1/");
}

async function authenticatedFetch(input, init = undefined) {
  const url = inputUrl(input);
  if (url.origin !== controlPlaneOrigin || !url.pathname.startsWith("/api/")) {
    return originalFetch(input, init);
  }
  if (isWorkerMachinePath(url.pathname) || url.pathname === "/api/admin-session") {
    return originalFetch(input, init);
  }

  const headers = requestHeaders(input, init);
  if (isOperatorOnlyPath(url.pathname)) {
    headers.set("x-markorbit-internal-authorization", internalSecret);
    headers.set("x-markorbit-principal", operatorPrincipalHeader());
  } else {
    const session = await browserSession();
    headers.set("cookie", `mo_session=${sessionToken}`);
    headers.set("x-markorbit-workspace-id", workspaceId);
    const method = inputMethod(input, init);
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("origin", controlPlaneOrigin);
      headers.set("x-markorbit-csrf-token", session.csrfToken);
    }
  }

  return originalFetch(input, { ...init, headers });
}

globalThis.fetch = authenticatedFetch;
