# M18 Retrieval Relevance Smoke Audit

## Purpose

M14 proves retrieval structural/provenance integrity. M16 and M17 plan and safely execute a narrow class of retrieval-layer repairs. M18 adds the next independent signal: whether an indexed foundational source can actually answer a deterministic representative query through the production SQLite FTS5/BM25 retrieval path.

This is an operational retrieval smoke test, not a legal or semantic correctness evaluator.

## Scope

M18 ships one explicit, version-controlled smoke probe for every ACTIVE FOUNDATIONAL target currently in the US and WIPO coverage catalogs:

- 11 USPTO foundational targets
- 8 WIPO foundational targets
- 19 total deterministic probes

Each probe is intentionally short and source-identifying, for example `TMEP`, `TBMP`, `TSDR`, `Madrid`, `Nice`, and `Gazette`.

The probe catalog is code-reviewed and deterministic. No LLM relevance grader, embedding service, external API, or adaptive query generation is involved.

## Audit contract

`GET /api/retrieval/relevance-audit`

Required query parameter:

- `workspaceId`

Optional query parameters:

- `jurisdiction=US|WO`
- `targetId=<coverage-target-id>`
- `topK=<positive integer>`; default 5, capped at 20

The audit is limited to `ACTIVE` + `FOUNDATIONAL` coverage targets.

## States

### READY

The curated query returns at least one current retrieval result when filtered to the target's registered source IDs, and one of those expected source IDs is present in the jurisdiction-wide global top K.

### DEGRADED

The target can answer its own source-filtered query, but the expected source is absent from the jurisdiction-wide global top K. This indicates ranking/relevance drift, not structural corruption.

### BLOCKED

The target has current retrieval supply but its curated source-filtered query returns no result. This is an operational query-readiness failure.

### NOT_APPLICABLE

The target has no registered/current retrieval document. M18 does not duplicate the upstream supply/readiness gate; missing supply remains owned by the existing foundational supply pipeline.

## Gap codes

- `PROBE_NOT_CONFIGURED`
- `NO_CURRENT_RETRIEVAL_DOCUMENT`
- `SOURCE_FILTERED_QUERY_MISS`
- `GLOBAL_TOP_K_MISS`

## Boundaries

M18 does **not**:

- claim that a retrieved chunk answers a legal question correctly
- score legal authority or applicability beyond existing source metadata
- infer deadlines, filing rules, or legal conclusions
- use LLMs or embeddings for relevance judgment
- mutate retrieval data
- trigger remediation
- broaden collection scope
- authorize collection or scheduling
- replace M14 structural/provenance quality audit

The result explicitly reports `semanticJudgment: false` and `scoringMode: SQLITE_FTS5_BM25_DETERMINISTIC_SMOKE`.

## Relationship to foundational readiness

M18 is intentionally shipped as a standalone read-only audit first. FOUNDATIONAL readiness remains governed by the existing supply + M14 structural quality gate in M15. A later milestone may choose to gate readiness on query smoke results after the probe set has proven stable in operation.
