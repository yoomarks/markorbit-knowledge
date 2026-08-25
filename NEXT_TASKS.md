# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `9ea52d0d3e99178fdeb17a8df7480b3697a73afc`  
**Latest audited MarkOrbit main:** `becd0a568acef5c8ef51c2df2de45b72b2c1f3c3`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed / frozen in the current execution stage

### Shared AI boundary

- Knowledge-side provider/semantics split remains frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- the latest audited MarkOrbit main contains a provider-neutral Managed AI runtime, DeepSeek adapter and an internal Managed AI execution route;
- Knowledge contains the managed-AI bridge that maps shared execution output into existing Knowledge acquisition semantics while preserving exact output/provenance;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** paid/live #405 acceptance or an end-to-end production Knowledge-to-shared-AI transport acceptance. Those remain evidence/governance tasks, not assumptions derived from repository code.

### Shared Communication / Expert

- legacy mailbox acquisition boundaries are frozen, but no verified shared production Communication send/reply capability is used by Knowledge yet;
- Expert V1 contracts, durable persistence/replay, fail-closed operator workflow and provenance-preserving retrieval are complete;
- K-EXP-004 remains blocked until real Shared Communication send identity and reply/thread correlation exist.

### K-CASE-000 — real MarkReg boundary resolved

The authoritative producer is `yoomarks/markorbit/services/markreg`.

Frozen producer facts include:

- canonical `FormalMatterId = formal-matter_${string}`;
- Workspace scope and immutable Formal Matter source snapshot/version/SHA;
- authenticated Formal Matter read surface;
- lifecycle current-view/event provenance with `officialStatusVerified: false`;
- MarkReg Recommended Action as advisory/execution-unauthorized data, not Knowledge recommendation;
- durable Document Package evidence metadata/checksums/storage references;
- no dedicated correspondence source model proven for Case yet.

Repository fixtures are **not** accepted as a live completed Case. K-CASE-008 remains separate.

### K-CASE-001 — Case Candidate V1

Merged in #450.

The contract freezes the exact MarkReg matter/workspace/version/snapshot identity, opaque authorized source retrieval ref, promotion metadata, access classification, idempotency key and deterministic natural source identity. It does not contain lessons, recommendations, truth scores or manual matter re-entry.

### K-CASE-003 — durable Candidate intake

Merged in #451.

Knowledge has durable Candidate persistence, idempotency ledger, source-snapshot dedupe, source-semantics conflict detection, `PENDING` / `WAITING_SOURCE` / semantic `COLLECTED` state, source-unavailable replay and Admin intake/read surfaces.

### K-CASE-004 — immutable MarkReg evidence collection

Merged in #452 on Knowledge main `f86ba50a80c171e1457d0abcdf8435ee31138a84`.

Knowledge now has:

- `CaseEvidenceCollectionV1` exact-evidence snapshots;
- exact JSON bytes/base64, byte length and SHA-256;
- Formal Matter ID/version/snapshot revalidation;
- authenticated lifecycle and Document Package collection through an injected trusted resolver;
- explicit `NOT_AUTHORIZED` / `NOT_AVAILABLE` optional-source omissions;
- retryable MarkReg failures -> `WAITING_SOURCE`;
- immutable SQLite evidence persistence/replay;
- non-requeueable `COLLECTED` state;
- Candidate -> trusted resolver -> authenticated collector -> immutable evidence composition.

No direct MarkReg DB read, credential invention, correspondence invention or payment-service ingestion was introduced.

### K-CASE-005 — evidence-backed Case Dossier V1

Merged in #453 on Knowledge main `f915f4c24c03af6914ebc40fec0d83d24e0c22a0`.

The versioned `CaseDossierV1` aggregate supports objective identity/background, evidence-backed narrative, timeline, Document Package facts, factual money when supported, deterministic durations, observed outcome when supported, access/version/state and objective completeness.

Every populated fact requires evidence refs locked to one immutable Case evidence collection. The validator recursively rejects lessons, recommendations, best practices, success probability, truth/authority scoring and predictions. `FINALIZED` is a dossier state; `PUBLISHED` is not.

### K-CASE-006 — deterministic objective dossier assembly

Merged in #454 on Knowledge main `9ea52d0d3e99178fdeb17a8df7480b3697a73afc`.

Knowledge now has:

- no new MarkReg network request during dossier assembly;
- exact K-CASE-004 bytes/size/SHA reverification before parsing;
- Candidate -> collection -> embedded Formal Matter/Lifecycle/Document Package lineage revalidation;
- a strict producer-supported fact whitelist for Formal Matter identity/background, lifecycle events and durable Document Package metadata;
- deliberate isolation of MarkReg `recommendedAction`;
- no promotion of `OPEN` or internal lifecycle state into observed Case outcome;
- no conversion of quote totals into actual paid/fee evidence;
- deterministic stable Dossier assembly from immutable evidence;
- durable SQLite Dossier snapshots, replay and immutable version lineage;
- persisted Dossier evidence refs constrained to real sourceRef/SHA/surface/package identities in the immutable collection;
- Admin composition for already-`COLLECTED` Candidate -> immutable evidence -> deterministic assembler -> durable Dossier with no MarkReg transport.

### K-CASE-007 — privacy review, redaction and finalization

PR #455 implements the Knowledge-owned privacy/finalization layer on top of immutable K-CASE-006 Dossiers:

- original MarkReg evidence and the reviewed internal Dossier version remain immutable;
- privacy review states are explicit: `REVIEW_REQUIRED`, `NEEDS_REDACTION`, `FINALIZED`, `REJECTED`;
- review transitions are stored as append-only full-snapshot events plus a current projection;
- one review lineage is allowed per Dossier/version and source access classification cannot drift after opening;
- sensitive findings use bounded categories and structured targets rather than arbitrary JSON patches;
- V1 redaction actions are limited to `MASK_VALUE` / `OMIT_ITEM`;
- every redaction target must exist in the source audience projection and duplicate target operations fail closed;
- a redacted audience derivative is rebuilt from the internal Dossier instead of copying and patching source JSON;
- evidence refs, MarkReg source refs, storage references, checksums and source snapshot identifiers are excluded from the audience derivative by construction;
- derivative audience content receives a deterministic SHA-256 that is recomputed again on persistence;
- broadening from a more restrictive source classification to a broader audience requires explicit approver, timestamp and justification;
- `publicationAuthorized` is fixed to `false` throughout the privacy contract;
- successful finalization persists the derivative separately and creates a new internal Dossier version with `FINALIZED` + `privacyReview: PRESENT`, while preserving the reviewed `ASSEMBLED` version unchanged;
- open/finalize retry paths reuse server-generated timestamps and normalize finding order so equivalent retries do not manufacture conflicts;
- rejected reviews create neither a derivative nor a finalized Dossier version.

K-CASE-007 does **not** publish a Case, infer sensitive facts with AI, downgrade original evidence access, or claim a real completed MarkReg acceptance.

## Current P0 order after #455

### P0-1 — K-CASE-002 MarkReg one-click promotion + trusted resolver binding

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required product action remains:

> Send to Knowledge Case

The producer must create/reuse a valid `CaseCandidateV1` and provide a legitimate server-side resolver path for MarkReg URL + Workspace + internal authorization + Workspace Principal.

This is a cross-repository write and is **not authorized by the current Knowledge takeover permission**. Do not invent the producer endpoint, credentials or a Knowledge-owned substitute.

### P0-2 — K-CASE-008 first real Case Dossier

Requires one completed real MarkReg matter plus the legitimate K-CASE-002 producer/auth resolver path. Acceptance must prove one real matter can be promoted once and produce a reviewable/privacy-finalized Case Dossier without duplicate manual reconstruction. Fixtures are not acceptance evidence.

Do not claim K-CASE-008 complete from repository fixtures, unit tests or synthetic MarkReg responses.

### P0-3 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Operational gates kept open

- issue #405 remains paid/live ADK acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains materially unresolved: Knowledge `main` has been observed unprotected during this execution stage;
- latest audited MarkOrbit `main` `becd0a568acef5c8ef51c2df2de45b72b2c1f3c3` is also unprotected;
- repository implementation is not evidence that production secrets, routes or external providers are live.

## STOP / DEFER

- new Knowledge-local generic AI provider transports;
- new Knowledge-local mailbox/provider platform features;
- fake live Expert send/reply evidence;
- direct reads of MarkReg database/persistence;
- manual reconstruction of MarkReg matters in Knowledge;
- invented MarkReg promotion endpoint, resolver or credentials;
- correspondence capture until a proven MarkReg/Communication source exists;
- payment-service ingestion until owner/auth/evidence semantics are frozen;
- universal Case ontology before real dossiers;
- Case lessons/recommendations/predictions/legal-truth certification;
- treating MarkReg Recommended Action as Knowledge Case conclusion;
- treating `FINALIZED` as publication authorization;
- public/broader Case release without explicit access review;
- Web Capability expansion ahead of higher-value Case/Communication dependencies.
