# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-26  
**Latest audited Knowledge main before this branch:** `6630e75f810e7103efdfe627cd87d4a9c9dd9f4d`  
**Latest audited MarkOrbit main:** `e277043dbf5d10e10626121662b0a16efc6f4ad1`

This file is the short execution pointer. The long-term plan remains `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`; stale Case baseline/status statements in that older plan are superseded by `docs/tasks/CASE_EXECUTION_RECONCILIATION_2026-08-25.md` and the current dependency ledgers.

## Completed / frozen in the current execution stage

### Shared AI boundary

- Knowledge-side provider/semantics split remains frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- latest audited MarkOrbit main contains the shared Managed AI capability/runtime path, durable execution-claim hardening and gated server bootstrap;
- Knowledge contains the managed-AI bridge that maps shared execution output into Knowledge acquisition semantics while preserving exact output/provenance;
- PR #458 routes ADK DeepSeek through the authenticated Managed AI HTTP bridge behind an explicit Knowledge runtime gate while retaining the legacy direct adapter as the default fallback;
- PR #462 binds Managed AI HTTP claim identity to the durable ADK queue `executionKey`, preserves same-execution replay while separating execution scopes, and routes reconciliation-required / non-retryable claim-store uncertainty into the existing `BLOCKED_RECOVERY` boundary;
- PR #463 adds permanent non-live cross-repository Managed AI HTTP acceptance against exact Core SHA `e277043dbf5d10e10626121662b0a16efc6f4ad1`;
- #463 builds the real Core Capability Engine dependency closure, starts the authenticated Core runtime on localhost, and drives it through the production Knowledge HTTP adapter with real `fetch` and a fake executor only;
- #463 proves same `executionKey` replay does not re-execute Core, distinct execution scopes remain distinct, caller-selected provider/model do not enter governed Core input, and post-dispatch executor uncertainty becomes reconciliation-required / non-retryable without a second executor invocation;
- PR #466 adds a daily/manual/relevant-PR Core-ref freshness gate: it resolves current `yoomarks/markorbit/main`, fails closed when `CORE_REF` is stale, and only then allows the real localhost Core HTTP E2E to run;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** paid/live #405 acceptance or live-provider production acceptance. The #463/#466 cross-repository gates use localhost and a fake executor only; repository code and non-live acceptance are not paid-provider execution evidence.

### Shared Communication / Expert

- legacy mailbox acquisition boundaries are frozen;
- no verified shared production Communication send/reply capability is used by Knowledge yet;
- K-EXP-001, K-EXP-002, K-EXP-003 and K-EXP-005 are complete;
- K-EXP-004 remains blocked until real Shared Communication send identity and inbound reply/thread correlation exist;
- issue #468 is the authoritative external dependency/acceptance ledger for that Shared Communication boundary and the first real Expert live slice.

### Case foundation

- **K-CASE-000 — resolved:** authoritative producer is `yoomarks/markorbit/services/markreg`; Formal Matter identity/workspace/version/snapshot, authenticated read boundary, lifecycle provenance and Document Package evidence semantics are frozen. No dedicated correspondence source model has been proven.
- **K-CASE-001 — complete:** PR #450, `CaseCandidateV1` source identity/idempotency/access boundary.
- **K-CASE-003 — complete:** PR #451, durable Candidate intake/replay/source-state persistence.
- **K-CASE-004 — complete:** PR #452, immutable authorized MarkReg evidence collection through a trusted resolver.
- **K-CASE-005 — complete:** PR #453, evidence-backed objective `CaseDossierV1` contract.
- **K-CASE-006 — complete:** PR #454, deterministic objective Dossier assembly from immutable evidence with no extra MarkReg request.
- **K-CASE-007 — complete:** PR #455, human privacy review/redaction/finalization with immutable originals and no publication authorization.
- **K-CASE-008 acceptance harness — infrastructure complete:** PR #456, durable TEST/LIVE-separated acceptance receipts/events over the existing intake -> trusted collection -> deterministic assembly -> human privacy path.
- **K-CASE-002 Knowledge-side producer-consumer boundary — materially advanced, not complete:**
  - PR #470 publishes a portable `CaseCandidateV1` JSON Schema and package subpath, with Node 22/24 conformance tests against the runtime validator;
  - PR #471 adds fail-closed authenticated internal Candidate intake. Internal service authentication is checked before Candidate handling; Workspace Principal, `matter:read` and workspace isolation remain explicit boundaries;
  - PR #472 adds request-bound MarkReg evidence collection. `MARKREG_URL` must be HTTP(S) without embedded credentials/query/fragment; the authenticated Workspace Principal and internal service credential are request-scoped and are not persisted; optional lifecycle/document-package 403s remain explicit `NOT_AUTHORIZED` omissions rather than fabricated evidence;
  - PR #473 removes an invented Knowledge-only minimum suffix length from `sourceMatterId`, keeping the portable/runtime contract faithful to the authoritative MarkReg `FormalMatterId = formal-matter_${string}` prefix contract while retaining the legal character and maximum bounds.

The #456 harness does **not** make K-CASE-008 complete. TEST runs can never become K-CASE-008 eligible; LIVE mode cannot use injected test transport; a finalized LIVE receipt needs a real producer promotion reference before it can even become eligible for operator K-CASE-008 review. Fixtures and synthetic MarkReg responses are not live acceptance evidence.

The #471 authenticated intake route and #472 collection route are **Knowledge consumer ingress**, not the missing MarkReg producer action. They must not be described as `Send to Knowledge Case` implementation.

### Repository governance and toolchain

- issue #429 remains open and materially unresolved at the repository-settings layer;
- PR #460 added `.github/CODEOWNERS`, assigning repository ownership and explicit ownership of `.github/workflows/**` and `.github/CODEOWNERS` to `@yoomarks`;
- CODEOWNERS is only a preparation layer until the `main` ruleset actually requires Code Owner review;
- the current engineering connector still exposes no branch-protection/ruleset or GitHub Environment administration, so protected-main enforcement, Environment approval/secret isolation and durable non-public ADK live-evidence retention cannot be truthfully marked complete from repository code alone;
- issue #430 is closed as completed: PR #438 replaced the broken pnpm 11.13.0 pins with pnpm 11.13.1 across root/workflows and PR #442 aligned release preflight; current Node 22/24 validation remains green on that toolchain.

## Current P0 order

### P0-1 — K-CASE-002 real MarkReg one-click producer action

Tracked by issue #467. Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required operator action remains conceptually:

> Send to Knowledge Case

The **remaining external producer work** is now narrower because Knowledge already owns the wire schema, authenticated intake and request-bound resolver. The MarkReg producer must:

- start from one real MarkReg `FormalMatter` and create/reuse a valid `CaseCandidateV1` directly from its actual matter ID, workspace, version and immutable snapshot SHA;
- consume the current portable Candidate schema rather than copying an older Knowledge regex/validator by hand;
- preserve the real source retrieval reference and avoid copying operational matter state into a second Case system;
- call the existing authenticated Knowledge Candidate intake boundary using the legitimate internal service credential + Workspace Principal;
- invoke/reuse the existing authenticated Knowledge collection boundary so evidence is read back from MarkReg under the same workspace/auth context;
- return an opaque producer promotion reference suitable for the LIVE acceptance receipt;
- preserve idempotency so replay of the same source snapshot does not create duplicate producer actions or duplicate Candidates;
- avoid implying publication, legal truth, recommendation or successful dossier finalization.

Fresh read-only audit of MarkOrbit main `e277043dbf5d10e10626121662b0a16efc6f4ad1` plus the current open-PR set found no `Send to Knowledge Case`, `CaseCandidateV1` producer binding or matching K-CASE-002 producer PR. The latest audited main change remains Managed AI server bootstrap, not Case promotion. This is now the primary Case blocker.

Current Knowledge takeover permission does **not** authorize writing `yoomarks/markorbit`. Do not implement a fake Knowledge-local MarkReg producer, direct MarkReg DB read, or synthetic promotion receipt. Use #467 as the authoritative producer handoff and acceptance ledger.

### P0-2 — K-CASE-008 first real Case Dossier

After the MarkReg producer exists, select one completed real MarkReg matter with strong evidence and run the already merged #456 harness using the real producer path and default HTTP transport.

Acceptance must prove one real matter can be promoted once, collected, assembled, privacy-finalized and retrieved without duplicate manual reconstruction or duplicate replay artifacts. The receipt must preserve real Candidate/source/producer lineage.

Do not create another acceptance framework. Reuse #456.

### P0-3 — K-EXP-004 first live Expert vertical slice

Tracked by issue #468 and still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Do not start merely to keep coding

- K-CASE-009 refresh/versioning before the first real K-CASE-008 slice;
- K-CASE-010 matter-type expansion before real dossier behavior validates the abstraction;
- another Case acceptance framework instead of #456;
- another Knowledge-local Candidate producer action instead of the MarkReg-side action tracked by #467;
- new Knowledge-local generic AI transports;
- new Knowledge-local mailbox/provider platform features;
- fake live Expert send/reply evidence;
- direct reads of MarkReg database/persistence;
- manual reconstruction of MarkReg matters in Knowledge;
- invented MarkReg credentials or producer promotion references;
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

- issue #405 remains paid/live ADK acceptance; non-paid readiness includes the real cross-repository localhost HTTP gate from #463 plus the Core-ref freshness guard from #466, but do not run paid acceptance merely to advance roadmap and do not infer repository-secret configuration from code;
- issue #429 remains open until the repository settings layer is actually enabled and verified;
- issue #467 remains open until the real MarkReg producer action and one real-matter K-CASE-008 path exist; #470/#471/#472/#473 are consumer-side readiness, not producer completion;
- issue #468 remains the Shared Communication dependency ledger, not evidence that communication send/reply exists;
- PR #460 CODEOWNERS does not itself prove protected-main enforcement;
- Knowledge main `6630e75f810e7103efdfe627cd87d4a9c9dd9f4d` is the latest audited code checkpoint before this docs branch;
- MarkOrbit main `e277043dbf5d10e10626121662b0a16efc6f4ad1` is the latest audited cross-repo checkpoint;
- repository implementation is not evidence that production secrets, routes, credentials or external providers are live.
