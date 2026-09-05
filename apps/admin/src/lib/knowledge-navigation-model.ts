import { knowledgeWorkspaceHref } from "./knowledge-workspace-model";

const LOCAL_ORIGIN = "https://markorbit.local";

function normalizeInternalHref(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (candidate.includes("\\") || /[\r\n\u0000]/u.test(candidate)) return null;

  try {
    const parsed = new URL(candidate, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function hasWorkspaceMismatch(href: string, workspaceId: string): boolean {
  const parsed = new URL(href, LOCAL_ORIGIN);
  const requestedWorkspace = parsed.searchParams.get("workspaceId")?.trim();
  return Boolean(requestedWorkspace && requestedWorkspace !== workspaceId);
}

export function knowledgeLocationHref(pathname: string, query: string): string {
  const safePathname = normalizeInternalHref(pathname) ?? "/knowledge";
  const path = new URL(safePathname, LOCAL_ORIGIN).pathname;
  const params = new URLSearchParams(query);
  params.delete("returnTo");
  const nextQuery = params.toString();
  return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
}

export function knowledgeEvidenceContextHref(
  href: string,
  workspaceId: string,
  returnTo?: string | null,
): string {
  const normalizedHref = normalizeInternalHref(href);
  if (!normalizedHref) throw new Error("Knowledge evidence href must be an internal path");

  const workspaceHref = knowledgeWorkspaceHref(normalizedHref, workspaceId);
  const parsed = new URL(workspaceHref, LOCAL_ORIGIN);
  const normalizedReturn = normalizeInternalHref(returnTo);
  if (normalizedReturn && !hasWorkspaceMismatch(normalizedReturn, workspaceId)) {
    parsed.searchParams.set("returnTo", normalizedReturn);
  }

  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}${parsed.hash}`;
}

export function resolveKnowledgeReturnHref(
  returnTo: string | null | undefined,
  workspaceId: string,
): string {
  const fallback = knowledgeWorkspaceHref("/knowledge", workspaceId);
  const normalizedReturn = normalizeInternalHref(returnTo);
  if (!normalizedReturn || hasWorkspaceMismatch(normalizedReturn, workspaceId)) return fallback;

  const parsed = new URL(normalizedReturn, LOCAL_ORIGIN);
  if (parsed.pathname.startsWith("/knowledge") && !parsed.searchParams.has("workspaceId")) {
    parsed.searchParams.set("workspaceId", workspaceId);
  }
  parsed.searchParams.delete("returnTo");

  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}${parsed.hash}`;
}
