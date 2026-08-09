# M7 — Source Supply Health

## Purpose

Source Supply Health answers one operational question for every curated source target:

> Can MarkOrbit Knowledge currently supply usable, traceable source data for this target, and if not, where is the supply chain broken?

It is a read-only operational projection over the existing Source Coverage, Source Registry, Collection/RawArtifact, Staging and Retrieval layers.

```text
SourceCoverageTarget
  ↓
SourceDefinition
  ↓
CollectionRun → RawArtifact
  ↓
StagingDocument
  ↓
RetrievalDocument / Chunks
  ↓
Source Supply Health
```

It does not create or dispatch Collection Plans, authorize collection, modify scheduler state, rank legal authority, infer legal rules, calculate deadlines, or produce final answers.

## Health dimensions

Each `SOURCE_SUPPLY_HEALTH` record exposes:

- coverage target identity and registration state;
- matched SourceDefinition IDs;
- latest collection run/status;
- registered RawArtifact count, artifact kinds and latest acquisition time;
- normalized StagingDocument count, READY count and latest status;
- retrieval/index count, current document/version/chunks and latest index time;
- acquisition freshness;
- explicit supply gaps;
- aggregate operational state.

## States

- `READY` — source is registered, has acquisition evidence, has no observed supply gap, and has normalized/retrievable current data.
- `DEGRADED` — acquisition evidence exists, but one or more downstream/freshness/failure gaps remain.
- `BLOCKED` — source is not registered or no governed acquisition evidence exists yet.

These states describe the data-supply pipeline only. They are not Source Intelligence scores and do not express legal reliability or substantive correctness.

## Explicit gaps

- `SOURCE_UNREGISTERED`
- `NO_ACQUISITION_EVIDENCE`
- `LATEST_COLLECTION_FAILED`
- `STALE_ACQUISITION`
- `NO_NORMALIZED_DOCUMENT`
- `NO_RETRIEVAL_DOCUMENT`

Unregistered coverage is intentionally distinct from observed low-quality or incomplete evidence.

## Freshness

Freshness uses internal operational observation windows derived from the coverage target's configured `changeSensitivity`:

| Change sensitivity | Maximum observed age |
| --- | ---: |
| HIGH | 48 hours |
| NORMAL | 168 hours / 7 days |
| LOW | 720 hours / 30 days |

The result is `FRESH`, `STALE`, or `UNOBSERVED` and includes both `ageHours` and `maxAgeHours`.

These windows are monitoring thresholds only. They do not create schedules, recurring jobs, collection authorization, service-level guarantees, or legal conclusions.

## API

`GET /api/source-supply-health`

Optional filters:

- `workspaceId` — defaults to the Global Public Knowledge workspace;
- `jurisdiction`;
- `family`;
- `coverageTier`;
- `catalogState`;
- `targetId`;
- `state` (`READY`, `DEGRADED`, `BLOCKED`).

The response contains the protocol version, observation timestamp, records and an aggregate summary across registration, acquisition, normalization, retrieval, freshness and gap counts.

## Boundary with Source Intelligence

Source Supply Health is intentionally independent from Source Intelligence v1/v2 policy, evidence maturity, review ownership, SLA and policy history. A source may be operationally `READY` while its Source Intelligence evidence remains unobserved or under review, and vice versa.

## Boundary with MO

This layer reports source-data availability and provenance. It does not turn source text into Rule, Requirement, Deadline, Procedure, Exception or other professional knowledge objects. Those interpretations remain in MO.
