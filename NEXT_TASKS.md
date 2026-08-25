# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `a8d495ca75fbf6489df9d75b818b6d9aa0e967ae`  
**Latest audited MarkOrbit main:** `4473e4be2ba432332d546c04b44397cb3bba3137`

This file is the short execution pointer. The long-term plan remains `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`; stale Case baseline/status statements in that older plan are superseded by `docs/tasks/CASE_EXECUTION_RECONCILIATION_2026-08-25.md`.

## Completed / frozen in the current execution stage

### Shared AI boundary

- Knowledge-side provider/semantics split remains frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- latest audited MarkOrbit main contains the shared Managed AI capability/runtime path and durable execution-claim hardening;
- Knowledge contains the managed-AI bridge that maps shared execution output into Knowledge acquisition semantics while preserving exact output/provenance;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** paid/live #405 acceptance or end-to-end production Knowledge-to-shared-AI acceptance. Repository code is not live-provider evidence.

### Shared Communication / Expert

- legacy mailbox acquisition boundaries are frozen;
- no verified shared production Communication send/reply capability is used by Knowledge yet;
- K-EXP-001, K-EXP-002, K-EXP-003 and K-EXP-005 are complete;
- K-EXP-004 remains blocked until real Shared Communication send identity and inbound reply/thread correlation exist.

### Case foundation

- **K-CASE-000 — resolved:** authoritative producer is `yoomarks/markorbit/services/markreg`; Formal Matter identity/workspace/version/snapshot, authenticated read boundary, lifecycle provenance and Document Package evidence semantics are frozen. No dedicated correspondence source model has been proven.
- **K-CASE-001 — complete:** PR #450, `CaseCandidateV1` source identity/idempotency/access boundary.
- **K-CASE-003 — complete:** PR #451, durable Candidate intake/replay/source-state persistence.
- **K-CASE-004 — complete:** PR #452, immutable authorized MarkReg evidence collection through a trusted resolver.
- **K-CASE-005 — complete:** PR #453, evidence-backed objective `CaseDossierV1` contract.
- **K-CASE-006 — complete:** PR #454, deterministic objective Dossier assembly from immutable evidence with no extra MarkReg request.
- **K-CASE-007 — complete:** PR #455, human privacy review/redaction/finalization with immutable originals and no publication authorization.
- **K-CASE-008 acceptance harness — infrastructure complete:** PR #456, merged on Knowledge main `a8d495ca75fbf6489df9d75b818b6d9aa0e967ae`.

The #456 harness composes the existing intake -> trusted collection -> deterministic assembly -> human privacy workflow and adds durable acceptance receipts/events. TEST runs can never become K-CASE-008 eligible; LIVE mode cannot use injected test transport; a finalized LIVE receipt needs a real producer promotion reference before it can even become eligible for operator K-CASE-008 review.

**K-CASE-008 itself is not complete.** Fixtures, synthetic MarkReg responses and unit tests are not live acceptance evidence.

## Current P0 order after #456

### P0-1 — K-CASE-002 MarkReg one-click promotion + trusted resolver binding

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required operator action remains conceptually:

> Send to Knowledge Case

The producer must:

- create/reuse a valid `CaseCandidateV1` directly from one real Formal Matter;
- preserve actual workspace/version/snapshot lineage without duplicate manual entry;
- provide the legitimate server-side resolver path for MarkReg URL + Workspace + internal authorization + Workspace Principal;
- return an opaque producer promotion reference suitable for the live acceptance receipt;
- preserve idempotency and avoid implying publication.

Fresh read-only audit of MarkOrbit main `4473e4be2ba432332d546c04b44397cb3bba3137` found no `Send to Knowledge`, `CaseCandidateV1` producer binding, Case promotion implementation or matching PR. This remains the primary Case blocker.

Current Knowledge takeover permission does **not** authorize writing `yoomarks/markorbit`. Do not invent a Knowledge-owned producer endpoint, credential or substitute resolver.

### P0-2 — K-CASE-008 first real Case Dossier

After K-CASE-002 exists, select one completed real MarkReg matter with strong evidence and run the already merged #456 harness using the real producer path and default HTTP transport.

Acceptance must prove one real matter can be promoted once, collected, assembled, privacy-finalized and retrieved without duplicate manual reconstruction or duplicate replay artifacts. The receipt must preserve real Candidate/source/producer lineage.

Do not create another acceptance framework. Reuse #456.

### P0-3 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Do not start merely to keep coding

- K-CASE-009 refresh/versioning before the first real K-CASE-008 slice;
- K-CASE-010 matter-type expansion before real dossier behavior validates the abstraction;
- new Knowledge-local generic AI transports;
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

## Operational gates kept open

- issue #405 remains paid/live ADK acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains materially unresolved;
- Knowledge main `a8d495ca75fbf6489df9d75b818b6d9aa0e967ae` was verified unprotected at this checkpoint;
- MarkOrbit main `4473e4be2ba432332d546c04b44397cb3bba3137` was also verified unprotected;
- repository implementation is not evidence that production secrets, routes, credentials or external providers are live.
