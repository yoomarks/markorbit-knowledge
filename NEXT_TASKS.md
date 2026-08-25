# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `f915f4c24c03af6914ebc40fec0d83d24e0c22a0`  
**Latest audited MarkOrbit main:** `becd0a568acef5c8ef51c2df2de45b72b2c1f3c3`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed / frozen in the current execution stage

### Shared AI boundary

- Knowledge-side provider/semantics split remains frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- the latest audited MarkOrbit main now contains a provider-neutral Managed AI runtime, DeepSeek adapter and an internal Managed AI execution route;
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

The versioned `CaseDossierV1` aggregate now supports objective identity/background, evidence-backed narrative, timeline, Document Package facts, factual money when supported, deterministic durations, observed outcome when supported, access/version/state and objective completeness.

Every populated fact requires evidence refs locked to one immutable Case evidence collection. The validator recursively rejects lessons, recommendations, best practices, success probability, truth/authority scoring and predictions. `FINALIZED` is a dossier state; `PUBLISHED` is not.

### K-CASE-006 — deterministic objective dossier assembly

PR #454 implements the Knowledge-owned assembly path:

- no new MarkReg network request during dossier assembly;
- exact K-CASE-004 bytes/size/SHA are reverified before parsing;
- Candidate -> collection -> embedded Formal Matter/Lifecycle/Document Package lineage is revalidated;
- a strict producer-supported fact whitelist extracts Formal Matter identity/background, lifecycle events and durable Document Package metadata;
- MarkReg `recommendedAction` is deliberately ignored;
- `OPEN` and internal lifecycle states are not promoted into observed Case outcome;
- quote totals are not represented as actual paid/fee evidence;
- unknown document shapes are ignored rather than guessed;
- identical immutable evidence produces a stable Dossier ID and byte-stable Dossier;
- durable SQLite Dossier snapshots support restart/replay and immutable versioning;
- persisted Dossier evidence refs must correspond to real sourceRef/SHA/surface/package identities in the immutable collection;
- Admin composition wires already-`COLLECTED` Candidate -> immutable evidence -> deterministic assembler -> durable Dossier with no MarkReg transport.

K-CASE-006 does **not** claim privacy review/finalization or a live completed MarkReg matter.

## Current P0 order after #454

### P0-1 — K-CASE-007 privacy/redaction workflow

Repository: `yoomarks/markorbit-knowledge`.

Implement explicit review/redaction without mutating original evidence or assembled Dossier facts:

1. restricted original Dossier/evidence remains immutable;
2. reviewer/redaction decision is durable and attributable;
3. redacted derivatives preserve original-vs-redacted lineage;
4. access classification cannot be broadened silently;
5. `NEEDS_REDACTION` / `REVIEW_REQUIRED` / `FINALIZED` transitions are explicit;
6. finalization must not imply publication or legal truth.

### P0-2 — K-CASE-002 MarkReg one-click promotion + trusted resolver binding

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required product action remains:

> Send to Knowledge Case

The producer must create/reuse a valid `CaseCandidateV1` and provide a legitimate server-side resolver path for MarkReg URL + Workspace + internal authorization + Workspace Principal.

This is a cross-repository write and is **not authorized by the current Knowledge takeover permission**. Do not invent the producer endpoint or credentials in Knowledge.

### P0-3 — K-CASE-008 first real Case Dossier

Requires one completed real MarkReg matter plus the legitimate producer/auth resolver path. Acceptance must prove one real matter can be promoted once and produce a reviewable Dossier without duplicate manual reconstruction. Fixtures are not acceptance evidence.

### P0-4 — K-EXP-004 first live Expert vertical slice

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
- invented MarkReg promotion endpoint or credentials;
- correspondence capture until a proven MarkReg/Communication source exists;
- payment-service ingestion until owner/auth/evidence semantics are frozen;
- universal Case ontology before real dossiers;
- Case lessons/recommendations/predictions/legal-truth certification;
- treating MarkReg Recommended Action as Knowledge Case conclusion;
- Web Capability expansion ahead of higher-value Case/Communication dependencies.
