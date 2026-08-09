# M19 — Foundational Retrieval Relevance Gate

## Purpose

M18 introduced a deterministic retrieval-relevance smoke audit for every ACTIVE FOUNDATIONAL US and WIPO source target. M19 promotes that audit into the FOUNDATIONAL readiness contract.

A source target is no longer READY merely because evidence exists, canonical content was indexed, and the retrieval index is structurally healthy. Its configured smoke probe must also demonstrate that the current source can actually be retrieved through the production SQLite FTS5/BM25 path.

This is an operational retrieval-readiness gate, not a legal or semantic correctness gate.

## Protocol

`FOUNDATIONAL_READINESS_PROTOCOL_VERSION` advances from `1.1` to `1.2`.

The readiness stages are now:

1. `REGISTER`
2. `COLLECT`
3. `INGEST`
4. `CONVERT`
5. `INDEX`
6. `QUALITY`
7. `RELEVANCE`
8. `HEALTH`
9. `READY`

The gate preserves first-actionable-stage precedence. Supply-pipeline failures remain ahead of retrieval quality. Structural retrieval quality remains ahead of relevance.

## Inputs

The worker loads three read-only control-plane views for a jurisdiction:

- `/api/source-supply-health`
- `/api/retrieval/audit`
- `/api/retrieval/relevance-audit`

M19 does not create a new crawler, scheduler, indexer, or repair path.

## Target result

Each `FoundationalReadinessTarget` now exposes:

- `retrievalQualityState`
- `retrievalAuditDocumentCount`
- `retrievalAuditGaps`
- `retrievalRelevanceState`
- `retrievalRelevanceProbeCount`
- `retrievalRelevanceGaps`

Retrieval relevance states at the readiness boundary are:

- `READY`
- `DEGRADED`
- `BLOCKED`
- `MISSING`
- `NOT_APPLICABLE`

A target with current retrieval documents must have exactly one M18 target-level relevance audit record. Missing or duplicate audit coverage blocks readiness.

If M18 reports `NOT_APPLICABLE` while supply health says current retrieval documents exist, M19 treats that as a blocked consistency error rather than silently accepting it.

## Gate behavior

For a target whose supply stage is `READY`:

1. M14 structural quality must evaluate to `READY`.
2. M18 deterministic retrieval relevance must evaluate to `READY`.
3. Only then does the target enter `READY`.

A `DEGRADED` relevance result such as `GLOBAL_TOP_K_MISS` blocks FOUNDATIONAL READY at `RELEVANCE`, just as a degraded structural quality result blocks at `QUALITY`.

A `BLOCKED` relevance result such as `SOURCE_FILTERED_QUERY_MISS` also blocks at `RELEVANCE`.

## Boundary

M19 does **not**:

- use an LLM relevance grader;
- judge legal correctness, completeness, applicability, or advice quality;
- authorize collection;
- trigger remediation;
- automatically tune BM25, probes, chunking, or source scope;
- convert a relevance failure into a destructive index mutation;
- bypass M14/M16/M17 quality and remediation boundaries.

M18 remains the observable deterministic smoke audit. M19 only consumes its output as a readiness signal.

## Relationship to prior milestones

- M14: structural retrieval quality audit
- M15: structural quality gates FOUNDATIONAL readiness
- M16: deterministic remediation planning
- M17: controlled execution for safe derived-state repairs
- M18: deterministic retrieval relevance smoke audit
- M19: relevance smoke audit gates FOUNDATIONAL readiness

The resulting readiness path is intentionally conservative:

`Evidence supply → Canonical/index availability → Structural quality → Query retrievability → READY`
