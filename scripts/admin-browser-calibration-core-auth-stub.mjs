#!/usr/bin/env node

import { createServer } from "node:http";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const port = Number(process.env.MARKORBIT_CALIBRATION_CORE_AUTH_PORT ?? "4109");
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("MARKORBIT_CALIBRATION_CORE_AUTH_PORT must be a valid TCP port");
}

const internalSecret = requiredEnv("MARKORBIT_CORE_INTERNAL_SECRET");
const sessionToken = requiredEnv("MARKORBIT_CALIBRATION_SESSION_TOKEN");
const sessionId = requiredEnv("MARKORBIT_CALIBRATION_SESSION_ID");
const userId = requiredEnv("MARKORBIT_CALIBRATION_USER_ID");
const workspaceId = requiredEnv("MARKORBIT_CALIBRATION_WORKSPACE_ID");
const membershipId = requiredEnv("MARKORBIT_CALIBRATION_MEMBERSHIP_ID");
const expiresAt = "2099-01-01T00:00:00.000Z";

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJson(request) {
  let value = "";
  for await (const chunk of request) value += chunk.toString("utf8");
  return value ? JSON.parse(value) : null;
}

function authenticated(request) {
  return request.headers["x-markorbit-internal-authorization"] === internalSecret;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, { ok: true });
    }
    if (!authenticated(request)) {
      return json(response, 401, { code: "INTERNAL_SERVICE_UNAUTHORIZED" });
    }

    if (request.method === "POST" && url.pathname === "/internal/auth/sessions/resolve") {
      const body = await readJson(request);
      if (body?.token !== sessionToken) {
        return json(response, 401, { code: "AUTHENTICATION_REQUIRED" });
      }
      return json(response, 200, {
        kind: "AUTHENTICATED_USER",
        sessionId,
        userId,
        sessionExpiresAt: expiresAt,
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === `/internal/onboarding/users/${encodeURIComponent(userId)}/workspaces`
    ) {
      return json(response, 200, {
        workspaces: [
          {
            workspace: {
              workspaceId,
              name: "D2.5 Isolated Calibration",
              status: "ACTIVE",
            },
            membership: {
              membershipId,
              workspaceId,
              userId,
              status: "ACTIVE",
              role: "WORKSPACE_ADMIN",
            },
          },
        ],
      });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/internal/auth/workspace-principals/resolve"
    ) {
      const body = await readJson(request);
      if (body?.token !== sessionToken) {
        return json(response, 401, { code: "AUTHENTICATION_REQUIRED" });
      }
      if (body?.workspaceId !== workspaceId) {
        return json(response, 403, { code: "WORKSPACE_MISMATCH" });
      }
      return json(response, 200, {
        kind: "WORKSPACE",
        sessionId,
        userId,
        workspaceId,
        membershipId,
        role: "WORKSPACE_ADMIN",
        permissions: ["matter:read", "workspace:read", "matter:manage", "review:perform"],
        sessionExpiresAt: expiresAt,
      });
    }

    return json(response, 404, { code: "NOT_FOUND", path: url.pathname });
  } catch (error) {
    return json(response, 500, {
      code: "CALIBRATION_AUTH_STUB_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`calibration-core-auth.ready http://127.0.0.1:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
