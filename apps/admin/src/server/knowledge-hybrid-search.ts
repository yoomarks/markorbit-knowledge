export const KNOWLEDGE_HYBRID_SEARCH_MODE = "METADATA_PLUS_FTS5_BM25" as const;
export const KNOWLEDGE_SEARCH_CHANNELS = ["FULL_TEXT", "METADATA"] as const;

export type KnowledgeSearchChannel = (typeof KNOWLEDGE_SEARCH_CHANNELS)[number];

export type KnowledgeFullTextEvidence = {
  indexMode: "SQLITE_FTS5_BM25";
  score: number;
  snippet: string;
  headingPath: string[];
};

export type KnowledgeHybridSearchMatch = {
  channels: KnowledgeSearchChannel[];
  fullText?: KnowledgeFullTextEvidence;
};

export type KnowledgeFullTextCandidate<T extends { id: string }> = {
  item: T;
  evidence: KnowledgeFullTextEvidence;
};

export type KnowledgeHybridSearchItem<T extends { id: string }> = T & {
  searchMatch: KnowledgeHybridSearchMatch;
};

export type KnowledgeSearchPage<T> = {
  items: T[];
  total: number;
};

/**
 * Consume a bounded persistence page size without turning that page size into
 * a correctness ceiling. Page size remains a caller-controlled transport
 * detail. Readers must report an exact total for the same stable query; an
 * empty page ends the loop defensively if the corpus changes while the request
 * is in flight.
 */
export function collectCompleteKnowledgeSearch<T>(
  readPage: (offset: number) => KnowledgeSearchPage<T>,
): T[] {
  const items: T[] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = readPage(offset);
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0) break;
  } while (offset < total);

  return items;
}

/**
 * Compose the two search channels that Knowledge actually has today.
 *
 * Full-text order is authoritative for composition because it is the explicit
 * FTS5/BM25 retrieval result order. Metadata matching may add a second channel
 * marker, but never boosts or reorders an FTS hit. Metadata-only results are
 * appended deterministically by document id. Graph relationships are
 * intentionally absent from this function and therefore cannot affect rank.
 */
export function composeKnowledgeHybridSearch<T extends { id: string }>(
  fullText: KnowledgeFullTextCandidate<T>[],
  metadata: T[],
): KnowledgeHybridSearchItem<T>[] {
  const metadataIds = new Set(metadata.map((item) => item.id));
  const seen = new Set<string>();
  const composed: KnowledgeHybridSearchItem<T>[] = [];

  for (const candidate of fullText) {
    if (seen.has(candidate.item.id)) continue;
    seen.add(candidate.item.id);
    composed.push({
      ...candidate.item,
      searchMatch: {
        channels: metadataIds.has(candidate.item.id) ? ["FULL_TEXT", "METADATA"] : ["FULL_TEXT"],
        fullText: candidate.evidence,
      },
    });
  }

  for (const item of [...metadata].sort((left, right) => left.id.localeCompare(right.id))) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    composed.push({
      ...item,
      searchMatch: { channels: ["METADATA"] },
    });
  }

  return composed;
}
