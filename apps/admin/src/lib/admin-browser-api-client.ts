type AdminSessionResponse = {
  csrfToken?: unknown;
  error?: { message?: unknown };
};

function sessionErrorMessage(body: AdminSessionResponse, fallback: string): string {
  const message = body.error?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

const ADMIN_WORKSPACE_HEADER = "x-markorbit-workspace-id";

function normalizedWorkspaceId(workspaceId: string): string {
  const normalized = workspaceId.trim();
  if (!normalized) throw new Error("Admin browser workspace context is required");
  return normalized;
}

export function adminBrowserWorkspaceHeaders(
  workspaceId: string,
  initialHeaders: HeadersInit = {},
): Headers {
  const headers = new Headers(initialHeaders);
  headers.set(ADMIN_WORKSPACE_HEADER, normalizedWorkspaceId(workspaceId));
  return headers;
}

export async function adminBrowserMutationHeaders(
  initialHeaders: HeadersInit = {},
): Promise<Headers> {
  const response = await fetch("/api/admin-session", { cache: "no-store" });
  const body = (await response.json()) as AdminSessionResponse;
  if (!response.ok) {
    throw new Error(sessionErrorMessage(body, "Unable to resolve Admin browser session"));
  }
  if (typeof body.csrfToken !== "string" || !body.csrfToken.trim()) {
    throw new Error("Admin browser session did not provide a CSRF token");
  }

  const headers = new Headers(initialHeaders);
  headers.set("x-markorbit-csrf-token", body.csrfToken);
  return headers;
}

export async function adminBrowserWorkspaceMutationHeaders(
  workspaceId: string,
  initialHeaders: HeadersInit = {},
): Promise<Headers> {
  const headers = await adminBrowserMutationHeaders(initialHeaders);
  headers.set(ADMIN_WORKSPACE_HEADER, normalizedWorkspaceId(workspaceId));
  return headers;
}
