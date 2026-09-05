export const KNOWLEDGE_BROWSER_PAGE_LIMIT = 20;

export type KnowledgeBrowserState = {
  q: string;
  sourceId: string;
  jurisdiction: string;
  artifactKind: string;
  status: string;
  offset: number;
};

type SearchParamsReader = {
  get(name: string): string | null;
};

const STRING_KEYS = ["q", "sourceId", "jurisdiction", "artifactKind", "status"] as const;

function normalizedOffset(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function readKnowledgeBrowserState(searchParams: SearchParamsReader): KnowledgeBrowserState {
  return {
    q: searchParams.get("q")?.trim() ?? "",
    sourceId: searchParams.get("sourceId")?.trim() ?? "",
    jurisdiction: searchParams.get("jurisdiction")?.trim().toUpperCase() ?? "",
    artifactKind: searchParams.get("artifactKind")?.trim() ?? "",
    status: searchParams.get("status")?.trim() ?? "",
    offset: normalizedOffset(searchParams.get("offset")),
  };
}

export function patchKnowledgeBrowserQuery(
  currentQuery: string,
  patch: Partial<KnowledgeBrowserState>,
  resetOffset = true,
): string {
  const params = new URLSearchParams(currentQuery);
  const next = { ...readKnowledgeBrowserState(params), ...patch };
  if (resetOffset && patch.offset === undefined) next.offset = 0;

  for (const key of STRING_KEYS) {
    const value = next[key].trim();
    if (value) params.set(key, value);
    else params.delete(key);
  }

  if (next.offset > 0) params.set("offset", String(next.offset));
  else params.delete("offset");

  return params.toString();
}

export function buildKnowledgeBrowserApiQuery(
  workspaceId: string,
  state: KnowledgeBrowserState,
  limit = KNOWLEDGE_BROWSER_PAGE_LIMIT,
): string {
  const params = new URLSearchParams({
    workspaceId,
    offset: String(state.offset),
    limit: String(limit),
  });
  for (const key of STRING_KEYS) {
    const value = state[key].trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}
