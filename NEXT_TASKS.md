# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `2c69e3ce6905796c93188324056697b8999d0ade`  
**Latest audited MarkOrbit main:** `e277043dbf5d10e10626121662b0a16efc6f4ad1`

This file is the short execution pointer. The long-term plan remains `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`; stale Case baseline/status statements in that older plan are superseded by `docs/tasks/CASE_EXECUTION_RECONCILIATION_2026-08-25.md`.

## Completed / frozen in the current execution stage

### Shared AI boundary

- Knowledge-side provider/semantics split remains frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- latest audited MarkOrbit main contains the shared Managed AI capability/runtime path, durable execution-claim hardening and gated server bootstrap;
- Knowledge contains the managed-AI bridge that maps shared execution output into Knowledge acquisition semantics while preserving exact output/provenance;
- PR #458 routes ADK DeepSeek through the authenticated Managed AI HTTP bridge behind an explicit Knowledge runtime gate while retaining the legacy direct adapter as the default fallback;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** paid/live #405 acceptance or live-provider production acceptance. Repository code and mocked/in-process tests are not provider-execution evidence.

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
- **K-CASE-008 acceptance harness — infrastructure complete:** PR #456, durable TEST/LIVE-separated acceptance receipts/events over the existing intake -> trusted collection -> deterministic assembly -> human privacy path.

The #456 harness does **not** make K-CASE-008 complete. TEST runs can never become K-CASE-008 eligible; LIVE mode cannot use injected test transport; a finalized LIVE receipt needs a real producer promotion reference before it can even become eligible for operator K-CASE-008 review. Fixtures and synthetic MarkReg responses are not live acceptance evidence.

### Repository governance

- issue #429 remains open and materially unresolved at the repository-settings layer;
- PR #460 added `.github/CODEOWNERS`, assigning repository ownership and explicit ownership of `.github/workflows/**` and `.github/CODEOWNERS` to `@yoomarks`;
- CODEOWNERS is only a preparation layer until the `main` ruleset actually requires Code Owner review;
- the current engineering connector still exposes no branch-protection/ruleset or GitHub Environment administration, so protected-main enforcement, Environment approval/secret isolation and durable non-public ADK live-evidence retention cannot be truthfully marked complete from repository code alone.

## Current P0 order

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

Fresh read-only audit of MarkOrbit main `e277043dbf5d10e10626121662b0a16efc6f4ad1` plus its current open-PR set found no `Send to Knowledge`, `CaseCandidateV1` producer binding, K-CASE-002 implementation or matching open PR. The latest main change is Managed AI server bootstrap, not Case promotion. This remains the primary Case blocker.

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
- paid/live #405 execution merely to advance roadmap;
- Web Capability expansion ahead of higher-value Case/Communication dependencies.

## Operational gates kept open

- issue #405 remains paid/live ADK acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains open until the repository settings layer is actually enabled and verified;
- PR #460 CODEOWNERS does not itself prove protected-main enforcement;
- Knowledge main `2c69e3ce6905796c93188324056697b8999d0ade` is the latest audited code checkpoint before this docs branch;
- MarkOrbit main `e277043dbf5d10e10626121662b0a16efc6f4ad1` is the latest audited cross-repo checkpoint;
- repository implementation is not evidence that production secrets, routes, credentials or external providers are live.
