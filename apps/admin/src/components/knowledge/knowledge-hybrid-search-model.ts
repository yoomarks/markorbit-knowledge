export const KNOWLEDGE_SEARCH_PAGE_LIMIT = 25;

export type KnowledgeSearchState = {
  q: string;
  sourceId: string;
  jurisdiction: string;
  status: string;
  artifactKind: string;
  generatedFrom: string;
  generatedTo: string;
  offset: number;
};

type SearchParamsReader = {
  get(name: string): string | null;
};

const STRING_KEYS = [
  "q",
  "sourceId",
  "jurisdiction",
  "status",
  "artifactKind",
  "generatedFrom",
  "generatedTo",
] as const;

function normalizedOffset(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function readKnowledgeSearchState(searchParams: SearchParamsReader): KnowledgeSearchState {
  return {
    q: searchParams.get("q")?.trim() ?? "",
    sourceId: searchParams.get("sourceId")?.trim() ?? "",
    jurisdiction: searchParams.get("jurisdiction")?.trim().toUpperCase() ?? "",
    status: searchParams.get("status")?.trim() ?? "",
    artifactKind: searchParams.get("artifactKind")?.trim() ?? "",
    generatedFrom: searchParams.get("generatedFrom")?.trim() ?? "",
    generatedTo: searchParams.get("generatedTo")?.trim() ?? "",
    offset: normalizedOffset(searchParams.get("offset")),
  };
}

export function patchKnowledgeSearchQuery(
  currentQuery: string,
  patch: Partial<KnowledgeSearchState>,
  resetOffset = true,
): string {
  const params = new URLSearchParams(currentQuery);
  const next = { ...readKnowledgeSearchState(params), ...patch };
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

export function buildKnowledgeSearchApiQuery(
  workspaceId: string,
  state: KnowledgeSearchState,
  limit = KNOWLEDGE_SEARCH_PAGE_LIMIT,
): string | null {
  const q = state.q.trim();
  if (!q) return null;

  const params = new URLSearchParams({
    workspaceId,
    q,
    limit: String(limit),
    offset: String(state.offset),
  });
  for (const key of STRING_KEYS.filter((value) => value !== "q")) {
    const value = state[key].trim();
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function knowledgeSearchRange(total: number, offset: number, visibleCount: number) {
  if (total <= 0 || visibleCount <= 0) return { start: 0, end: 0 };
  return {
    start: Math.min(offset + 1, total),
    end: Math.min(offset + visibleCount, total),
  };
}
