# M14 — Retrieval Quality Audit

## Purpose

M14 adds a read-only, derived quality gate for the retrieval projection. It answers a narrower question than Source Supply Health: when a document is present in retrieval, is the projection internally consistent and traceable back through the evidence chain?

This audit does not make canonical content authoritative, score legal correctness, calculate deadlines, or repair data automatically.

## Scope

The audit checks each indexed retrieval document for:

- StagingDocument presence.
- ReadyPackage presence.
- RawArtifact presence.
- ReadyPackage → StagingDocument / RawArtifact / source provenance consistency.
- exactly one current version per logical retrieval document.
- current version equals the latest indexed artifact version.
- at least one retrieval chunk.
- declared chunk count equals persisted chunk count.
- chunk ordinals are contiguous from 1..N.
- no empty chunk text.
- FTS5 row count equals persisted retrieval chunk count.
- repeated chunk text is surfaced as a quality warning.

Historical retrieval versions are retained and can be included explicitly in an audit.

## States

- `READY` — no audit gaps.
- `DEGRADED` — only non-destructive duplicate-content warnings are present.
- `BLOCKED` — one or more hard integrity or provenance gaps are present.

The state is a retrieval-projection health signal only. It is not a statement about legal correctness, completeness, applicability, or substantive accuracy.

## API

```text
GET /api/retrieval/audit?workspaceId=<workspace>
```

Optional filters:

- `sourceId`
- `jurisdiction`
- `includeHistorical=true|false`

The response contains an aggregate summary plus per-document gaps and metrics.

## Gap codes

- `STAGING_DOCUMENT_MISSING`
- `READY_PACKAGE_MISSING`
- `RAW_ARTIFACT_MISSING`
- `PROVENANCE_LINK_MISMATCH`
- `MULTIPLE_CURRENT_VERSIONS`
- `CURRENT_VERSION_NOT_LATEST`
- `NO_CHUNKS`
- `CHUNK_COUNT_MISMATCH`
- `CHUNK_ORDINAL_GAP`
- `EMPTY_CHUNK`
- `FTS_ROW_COUNT_MISMATCH`
- `DUPLICATE_CHUNK_CONTENT`

## Operating boundary

M14 is deliberately read-only:

- it does not mutate RawArtifact, StagingDocument, ReadyPackage, or RetrievalDocument records;
- it does not delete duplicate evidence;
- it does not re-run conversion or collection;
- it does not rebuild FTS automatically;
- it does not broaden collection authorization;
- it does not infer legal rules or generate legal answers.

Remediation remains an explicit operator action through the existing acquisition, conversion/recovery, finalization, and indexing pathways.

## Relationship to earlier milestones

M7 answers whether a governed source has acquisition, normalization, retrieval, and freshness coverage. M12 operationalizes US foundational readiness. M13 adds governed WIPO trademark source supply. M14 adds an independent integrity check after indexing so that `retrieval present` is no longer treated as equivalent to `retrieval healthy`.
