type AdminSessionResponse = {
  csrfToken?: unknown;
  error?: { message?: unknown };
};

function sessionErrorMessage(body: AdminSessionResponse, fallback: string): string {
  const message = body.error?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
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
