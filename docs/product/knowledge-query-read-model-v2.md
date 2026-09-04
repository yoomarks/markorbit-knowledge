# Knowledge Query Read Model V2

## Purpose

Knowledge Query Read Model V2 is the workspace-scoped corpus truth shared by Knowledge Browser and Hybrid Search. It does not introduce a new search service or semantic layer. It centralizes the membership and evidence projection rules that were already duplicated between the Browser SQL path and the Hybrid Search caller.

## Responsibility boundary

The read model owns:

- workspace-scoped corpus membership, failing closed on `workspaceId`;
- structured filters for source, jurisdiction, artifact kind and staging status;
- metadata matching for Browser-style `q` queries;
- source / RawArtifact provenance projection into Knowledge result items;
- exact corpus totals and staging-status summary counts;
- deterministic corpus ordering by `generatedAt DESC, stagingDocumentId DESC`;
- artifact-kind facets under the active corpus query;
- source and jurisdiction selector options from the complete workspace source catalog.

Retrieval owns full-text relevance and rank. A retrieval hit is not automatically a Knowledge result: its staging-document ID must resolve through the read model under the same workspace and structured filters before Hybrid Search can expose it.

Core semantic intelligence remains outside Knowledge.

## Browser semantics

`queryKnowledgeReadModel` is the canonical persistence query. `queryKnowledgeBrowser` remains as a compatibility name and delegates directly to the canonical read model.

Browser pages are bounded to at most 50 rows per transport query, but `total` and `summary` are exact over the complete matching corpus. Pagination is stable because the corpus order is deterministic.

The current time semantic is the persisted `generatedAt` evidence timestamp and its deterministic descending order. Phase 3 does not add an unobserved date-range UI or alternate sort contract as part of #705.

## Hybrid Search semantics

Hybrid Search keeps the complete-paging behavior established in #704:

1. metadata matches traverse the complete read model;
2. FTS results traverse the complete retrieval result set in retrieval rank order;
3. retrieval staging-document IDs are resolved in batches of at most 50 through the read model;
4. candidates rejected by workspace or structured corpus filters are dropped;
5. accepted candidates are restored to retrieval order before composition;
6. FTS matches remain first in retrieval rank order; metadata may add a match channel but does not boost or reorder them;
7. metadata-only matches are appended deterministically by the existing Hybrid Search composition contract.

The batch size of 50 is therefore a transport bound, not a correctness ceiling.

## Facet semantics

Artifact-kind facets use the same active read-model query as the Browser/Search corpus, including `q`, source, jurisdiction, artifact kind and status filters.

Source and jurisdiction selector options intentionally describe the complete source catalog for the authenticated workspace rather than only the current result set. This lets an operator change filters even when the current query returns zero documents.

## Exactness

- Browser corpus `total`, status summary and active-query artifact-kind facets are exact.
- Hybrid Search reports a complete deduplicated union because both metadata and FTS channels are exhaustively paged before composition.
- FTS page size and read-model candidate batch size are bounded implementation details, not partial-result semantics.
- No graph score, vector score, blended score or synthetic semantic ranking is introduced.

## Compatibility

The wire shape and existing Knowledge Browser version marker remain unchanged in #705. V2 names the internal shared read-model responsibility, not a breaking HTTP response version.
