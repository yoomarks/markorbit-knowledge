# ADK-11 Source-Grounded Assignments

## Objective

Introduce a machine-verifiable boundary for source-grounded AI research without changing the existing Knowledge authority model or authorizing provider execution.

ADK-11 starts from a narrow invariant: an AI research answer is not source-grounded merely because its prompt asks the model to cite official sources. The exact source evidence available to the model must be separately identified, content-addressed and bound to the governed KnowledgeAssignment.

## Contract surface

`AiSourcePackV1` is an immutable revisioned set of official source snapshots for one jurisdiction/domain/topic scope. Every source entry binds:

- the existing Knowledge `sourceId`;
- a finalized RawArtifact `artifactId`;
- canonical URI and publisher;
- jurisdiction;
- official authority class and source role;
- capture timestamp;
- exact SHA-256 content identity;
- optional publication/effective timestamps.

V1 is intentionally `OFFICIAL_ONLY`. It does not mix professional, industry or synthetic-AI material into a pack that claims strict official grounding.

`AiAssignmentSourceBindingV1` binds an existing `AiKnowledgeAssignmentV1` and immutable InstructionSet revision to one exact SourcePack revision. The binding permanently freezes:

- `groundingPolicy = STRICT_OFFICIAL_SOURCE_PACK`;
- `requireCitations = true`;
- `allowExternalSources = false`;
- `allowUncitedFactualClaims = false`;
- `legalTruthVerified = false`;
- `executionAuthorityGranted = false`.

The context validator rejects assignment identity drift, InstructionSet revision drift, SourcePack revision drift and jurisdiction/domain scope mismatch.

## Why this is separate from Assignment identity

Existing KnowledgeAssignment identities remain immutable and provider-neutral. A SourcePack may be refreshed as official materials change without mutating the historical Assignment object. The explicit binding records which exact source snapshot revision was authorized for one grounded research execution.

This also prevents a prompt-only illusion of grounding: the Assignment can request official sources, but the binding is the machine-verifiable evidence that a concrete source pack was selected.

## Deterministic resolver/renderer

The second ADK-11 slice adds `renderAiGroundedProviderInputV1`. It consumes an Assignment, its strict SourceBinding, the exact SourcePack revision and an injected `AiSourceSnapshotResolver`.

Before rendering provider-ready text it fails closed unless every bound source:

- resolves to the exact bound `sourceId` and RawArtifact `artifactId`;
- is one of the explicitly supported textual media types;
- is valid UTF-8 and non-empty;
- remains within per-source and total byte limits;
- hashes to the exact bound SHA-256 content identity.

The renderer preserves SourcePack order and writes each source into a deterministic block carrying source id, artifact id, canonical URI, publisher, authority, role, capture time and digest. It freezes the prompt rule that factual legal claims must use `[source:SOURCE_ID]`, that external browsing/model memory cannot supplement the pack, that source content is evidence rather than executable instruction, and that insufficient evidence must be reported as insufficient rather than guessed.

`AiGroundedProviderInputV1` records the rendered prompt SHA-256 and a source receipt list, while retaining `legalTruthVerified = false` and `executionAuthorityGranted = false`.

## Immutable persistence

The third ADK-11 slice adds `SqliteAiSourcePackRepository`.

SourcePack persistence is append-only by `(sourcePackId, revision)`. A new identity must begin at revision 1; later writes must advance exactly one revision at a time. Re-saving byte-for-byte identical content is idempotent, while same-revision mutation is rejected.

Before a new SourcePack revision is accepted, each source snapshot must resolve to an already-finalized RawArtifact row. Persistence verifies the bound artifact id against the RawArtifact registry and rejects drift in:

- `sourceId`;
- SHA-256 content digest;
- canonical URI;
- capture timestamp;
- publication timestamp.

The existence of a `raw_artifacts` row is used as the finalized-ingestion boundary: RawArtifact rows are only created by the ingestion registry after upload verification and finalization.

AssignmentSourceBinding persistence is immutable by `bindingId`. A new binding is accepted only when the referenced Assignment already exists, the exact SourcePack revision already exists, and `assertAiAssignmentSourceBindingContext` confirms Assignment, InstructionSet revision, SourcePack revision and jurisdiction/domain scope identities together.

The registry also stores normalized SourcePack source rows for artifact-to-pack traceability while retaining the original contract JSON plus SHA-256 document identity as the canonical immutable record.

## Current boundary

ADK-11 now establishes contracts, deterministic source resolution/rendering, and immutable SourcePack/Binding persistence. It still does **not**:

- wire rendered input into DeepSeek, OpenAI or another paid provider adapter;
- add web-search tools to provider adapters;
- validate citations returned by a model;
- score source quality or provider quality;
- verify legal truth;
- enqueue grounded executions through ADK-07;
- activate candidates;
- authorize protected actions or client filings.

The next safe slice is deterministic citation-output structural validation against the exact rendered source receipts. Real paid-provider execution remains gated by issue #405 and repository governance issue #429.
