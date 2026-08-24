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

The renderer preserves SourcePack order and writes each source into a deterministic block carrying source id, artifact id, canonical URI, publisher, authority, role, capture time and digest. It freezes the prompt rule that factual legal claims must use `[source:SOURCE_ID]`, that external browsing/model memory cannot supplement the pack, and that source content is evidence rather than executable instruction.

If the source pack cannot support a requested conclusion, the renderer requires a machine-readable line beginning exactly with `SOURCE_PACK_INSUFFICIENT:` followed by a non-empty reason. This gives downstream validation a deterministic fail-closed alternative to uncited guessing.

`AiGroundedProviderInputV1` records the rendered prompt SHA-256 and a source receipt list, while retaining `legalTruthVerified = false` and `executionAuthorityGranted = false`.

## Immutable SourcePack and Binding persistence

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

## Deterministic citation-output validation

The fourth ADK-11 slice adds `validateAiGroundedProviderOutputV1` as a provider-neutral structural validator.

Before accepting an output receipt it:

- recomputes the rendered prompt SHA-256 and rejects prompt identity drift;
- rejects empty provider output;
- recognizes only exact citation tokens in the protocol form `[source:src_<26-character Crockford ULID>]`;
- rejects malformed source citation tokens;
- rejects source IDs not present in the exact rendered SourcePack receipts;
- rejects duplicate source identities in the provider input;
- requires at least one valid bound-source citation unless a non-empty `SOURCE_PACK_INSUFFICIENT:` declaration is present;
- preserves the exact raw provider-output SHA-256 in the validation receipt;
- reports citation count, ordered unique cited source IDs, unreferenced bound source IDs and insufficiency state.

`AiGroundedOutputValidationReceiptV1` is a shared `@markorbit/contracts` protocol object rather than a worker-local shape. The contract itself rejects malformed source identities, cited/unreferenced overlap, inconsistent grounded/insufficient status semantics, digest-shape drift and any authority escalation.

This validator is intentionally structural rather than semantic. A valid receipt means the output obeyed machine-checkable source identity rules; it does **not** mean every factual statement is correctly supported. Therefore every receipt explicitly retains both `legalTruthVerified = false` and `semanticClaimCoverageVerified = false`.

## Immutable validation evidence linkage

The fifth ADK-11 slice adds `SqliteAiGroundedValidationEvidenceRepository` and deliberately reuses the existing AI RawArtifact ingestion boundary instead of introducing a second output store.

A grounded validation evidence record binds one immutable `AiResearchSubmissionV1` to:

- the exact persisted Assignment/Binding/SourcePack identities named by its validation receipt;
- the exact prompt SHA-256 frozen in both submission and receipt;
- the exact Markdown output SHA-256 frozen in both submission and receipt;
- the exact raw provider JSON RawArtifact identified by `rawResponseSha256`;
- the exact distilled Markdown RawArtifact identified by `markdownSha256` and output SHA-256;
- the Markdown RawArtifact parent lineage back to that raw provider response;
- the existing `ai+markorbit://` provider, model, assignment and submission URI identities;
- one shared workspace/source execution scope for the raw and Markdown artifacts.

Before persistence, the repository also compares `citedSourceIds + unreferencedSourceIds` against the complete source-ID set of the exact persisted SourcePack revision. A structurally valid receipt produced from a partial or different source set therefore cannot be admitted as governed evidence.

Evidence is immutable by `submissionId`. Exact replay is idempotent; any same-submission mutation is rejected. The table retains canonical submission + receipt + artifact-link JSON together with an evidence SHA-256 while normalizing assignment, binding, provider/model, artifact and digest fields for audit queries.

## Prepared grounded execution envelope

The sixth ADK-11 slice introduces `AiGroundedExecutionEnvelopeV1` and `prepareAiGroundedExecutionV1`.

The envelope is intentionally a **PREPARED** object, not an execution authorization. It freezes:

- Assignment identity;
- Binding identity;
- exact SourcePack identity and revision;
- renderer version;
- rendered prompt SHA-256;
- the ordered source-receipt list and its SHA-256;
- a deterministic `executionInputSha256` over the governed input identities;
- preparation timestamp.

Every envelope contract permanently fixes these boundaries to false:

- `providerCallAuthorized`;
- `providerCallExecuted`;
- `externalBrowsingAllowed`;
- `legalTruthVerified`;
- `executionAuthorityGranted`.

The worker runtime first invokes the existing strict source renderer, then derives the source-receipt and execution-input hashes from the successfully validated rendered input. Therefore no envelope can be created when a source is missing, has identity drift, uses an unsupported media type, exceeds configured bounds or fails the frozen SHA-256 check.

`apps/worker` adds `preparePersistedAiGroundedExecutionV1`, which resolves a persisted Binding, its immutable Assignment and the exact SourcePack revision before preparing the envelope. This keeps persistence and worker-runtime dependency directions separate while still testing the real persisted composition.

The operator-facing `adk:grounded:prepare` dry-run command reads:

- `MARKORBIT_ADK_GROUNDED_DB_PATH`;
- `MARKORBIT_ADK_GROUNDED_STORAGE_ROOT`;
- `MARKORBIT_ADK_GROUNDED_BINDING_ID`;
- `MARKORBIT_ADK_GROUNDED_OUTPUT_PATH`.

It resolves the bound source artifacts from the existing local RawArtifact store, renders the exact provider input, and writes a private `0600` prepared-execution file using exclusive creation. The output includes both the PREPARED envelope and provider input for operator inspection, but the command has no provider adapter and does not read provider secrets.

## Governed PREPARED execution evidence and replay

The seventh ADK-11 slice promotes the rendered PREPARED input from an operator-only file into governed evidence without authorizing a provider call.

`ingestAiGroundedPreparedPromptAsRawArtifact` validates the exact rendered prompt bytes against `renderedPromptSha256` before entering the existing authenticated RawArtifact ingestion boundary. The prompt is persisted as `MARKDOWN` / `text/markdown` with stable identities derived from `executionInputSha256` and a stable idempotency key derived from both execution-input and prompt hashes. The finalized RawArtifact is checked again for content hash, size, canonical URI and provenance source URI before it can be linked to evidence.

`SqliteAiGroundedPreparedExecutionEvidenceRepository` then independently revalidates the PREPARED envelope before persistence. It:

- recomputes `sourceReceiptsSha256` from the ordered receipts;
- recomputes `executionInputSha256` from Assignment, Binding, SourcePack revision, renderer and prompt/source-receipt hashes;
- resolves the persisted Assignment, Binding and exact SourcePack revision;
- requires the envelope source receipts to match the complete SourcePack in exact order;
- rechecks every source receipt against its finalized RawArtifact content hash, URI, media type and size;
- rechecks the rendered-prompt RawArtifact against the frozen prompt SHA-256 and stable `ai+markorbit://grounded-executions/...` identities;
- stores normalized source-artifact links plus canonical evidence JSON and its SHA-256.

`executionInputSha256` is the immutable persistence identity. The first successfully persisted evidence keeps the canonical `preparedAt`. A later restart may prepare the same governed input at a different wall-clock time; if all input identities are unchanged, persistence returns the original canonical evidence as an idempotent replay. Any same-input mutation of Assignment, Binding, SourcePack, renderer, source receipts, prompt identity or prompt RawArtifact is rejected.

`persistPreparedAiGroundedExecutionV1` checks the provider-input body against the envelope before storage and queries existing evidence before uploading the prompt. A restart that already has canonical evidence therefore skips the prompt upload entirely and revalidates the existing evidence instead of creating another governed object.

The prompt RawArtifact intentionally does not use `parentArtifactIds` to point at every SourcePack artifact. Existing RawArtifact parent-lineage integrity requires parent artifacts to share one source execution scope, while a legitimate SourcePack may combine multiple official sources. The PREPARED evidence registry therefore records the complete ordered source-artifact lineage explicitly without weakening the existing RawArtifact same-source parent invariant.

## Current boundary

ADK-11 now establishes SourcePack/Binding contracts, deterministic source resolution/rendering, immutable SourcePack/Binding persistence, structural citation-output validation, immutable validation-evidence linkage, a provider-neutral PREPARED execution envelope, and governed PREPARED prompt/input evidence with restart/replay semantics. It still does **not**:

- authorize or execute DeepSeek, OpenAI or another provider call through the grounded runtime;
- add external web-search tools to provider adapters;
- semantically verify that each factual claim is supported by its cited source;
- score source quality or provider quality;
- verify legal truth;
- enqueue grounded executions through ADK-07;
- activate candidates;
- authorize protected actions or client filings.

The next safe slice is to integrate the governed PREPARED execution identity into ADK-07 queue semantics while keeping provider execution disabled: queue/recovery/idempotency should operate on the immutable `executionInputSha256` evidence boundary before any paid-provider adapter is reachable. Real paid-provider execution remains gated by issue #405 and repository governance issue #429.
