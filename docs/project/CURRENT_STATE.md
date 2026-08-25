# MarkOrbit Knowledge — Current Engineering State

Checkpoint date: 2026-08-26

This file is the canonical engineering handoff entry point. It records a verified checkpoint, not a dynamically generated branch pointer. Before any protected, paid or live operation, verify the current GitHub `main` SHA and the relevant issue/PR state again.

## Verified baseline

- Repository: `yoomarks/markorbit-knowledge`
- Verified Knowledge `main` before this reconciliation branch: `c6984e371493cf525600607b02c2506c2c8ca84b`
- Latest merged Knowledge PR: #474 — `Docs: sync Case handoff after 473`
- Latest audited MarkOrbit/Core `main`: `e277043dbf5d10e10626121662b0a16efc6f4ad1`
- Open paid/live acceptance gate: issue #405 — ADK-06 real 3×2 provider acceptance
- Open repository-governance gate: issue #429 — protected main/ruleset, protected live secrets/environment, and durable encrypted evidence retention
- Open Case producer dependency: issue #467 — real MarkReg `Send to Knowledge Case` producer action
- Open Expert dependency: issue #468 — Shared Communication send/reply identity for the first live Expert slice
- `main` is still verified as `protected: false`; PR #460 CODEOWNERS is preparation only and does not close #429.

## Canonical strategic direction

The product direction remains Web / AI / Expert / Case, with Knowledge preserving objective information and Brain owning interpretation, evaluation and recommendation.

Primary canonical documents:

1. `docs/product/KNOWLEDGE_LONG_TERM_STRATEGY.md`
2. `docs/architecture/KNOWLEDGE_CAPABILITY_SOURCE_BOUNDARIES.md`
3. `docs/architecture/CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`
4. `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`
5. `docs/tasks/CASE_EXECUTION_RECONCILIATION_2026-08-25.md`
6. `NEXT_TASKS.md`

Where older implementation-status statements conflict with the Case reconciliation or `NEXT_TASKS.md`, the newer execution checkpoint governs. The long-term product boundaries and non-goals remain unchanged.

## Permanent Knowledge / Brain boundary

Knowledge objectively acquires, preserves, structures, relates, updates, versions and retrieves information.

Knowledge does **not** own:

- source/provider/expert ranking to decide who is right;
- legal-truth certification;
- deep interpretation;
- cross-case generalization;
- prediction;
- recommendation;
- strategy;
- protected decisions.

Those belong to Brain, humans, Core or another governed decision system.

For Knowledge, an AI answer is an acquired source. For Brain, AI may be a reasoning tool. Do not merge those responsibilities.

## Four long-term Knowledge pillars

### 1. Web

Public web, official sources, documents, APIs, feeds, media and structured public information.

**State:** substantial production foundation exists.

**Current decision:** Web acquisition remains inside `markorbit-knowledge`; do not migrate it to shared Capability now and do not expand it ahead of the higher-value Case/Communication blockers unless a concrete production gap requires it.

### 2. AI

Defined questions/assignments answered by AI providers and preserved as auditable source responses.

**State:** Knowledge acquisition/evidence semantics are mature and the shared Managed AI boundary has been materially proven.

Current merged state includes:

- Knowledge-side Managed AI bridge preserving Knowledge acquisition/provenance semantics;
- PR #458 routing ADK DeepSeek through authenticated Managed AI HTTP behind an explicit runtime gate while retaining the legacy direct adapter as fallback;
- PR #462 binding Managed AI replay to durable ADK queue `executionKey` identity and preserving fail-closed reconciliation semantics;
- PR #463 real non-live cross-repository localhost HTTP acceptance against exact Core SHA using the production Knowledge HTTP adapter and authenticated Core runtime, with a fake executor only;
- PR #466 a permanent Core-ref freshness/drift guard before cross-repository Managed AI acceptance.

**Not claimed:** paid-provider/live acceptance. The non-live cross-repository gate is capability evidence, not #405 evidence.

**Current decision:** generic AI transport/runtime belongs in shared MarkOrbit Capability; Knowledge retains assignment/source semantics, exact raw evidence, RawArtifact lineage, provenance, recovery and no-legal-truth boundaries.

### 3. Expert

Questions sent to lawyers/agents/experts and their professional replies/attachments preserved as Knowledge sources.

**State:** Knowledge-owned Expert foundation is implemented.

Completed:

- K-EXP-001 — `ExpertQuestionTaskV1` / `ExpertSourceRecordV1` contracts;
- K-EXP-002 — durable persistence and replay idempotency;
- K-EXP-003 — fail-closed operator workbench/task flow;
- K-EXP-005 — provenance-preserving Expert source retrieval/filtering/pagination.

Remaining blocker:

- K-EXP-004 — first real live Expert vertical slice, blocked on Shared Communication production send identity, durable message/thread identity and real inbound reply correlation. Tracked by #468.

Knowledge must remain the consumer of communication evidence, not become a second generic mailbox/provider platform.

### 4. Case

Complete objective Case Dossiers reconstructed from real operational matters.

**State:** Knowledge-side Case foundation is largely implemented; the remaining first-order blocker is the real MarkReg producer action.

Authoritative producer boundary:

- `yoomarks/markorbit/services/markreg`
- canonical `FormalMatterId = formal-matter_${string}`
- workspace-scoped Formal Matter identity
- version + immutable snapshot SHA lineage
- authenticated Formal Matter read surface
- lifecycle provenance
- Document Package evidence metadata/checksum/storage references

Completed Knowledge-owned work:

- K-CASE-000 — real MarkReg boundary located/frozen;
- K-CASE-001 — `CaseCandidateV1` contract, PR #450;
- K-CASE-003 — durable Candidate intake/replay/source-state persistence, PR #451;
- K-CASE-004 — immutable authorized MarkReg evidence collection through trusted resolver, PR #452;
- K-CASE-005 — evidence-backed objective `CaseDossierV1`, PR #453;
- K-CASE-006 — deterministic objective Dossier assembly from immutable evidence, PR #454;
- K-CASE-007 — human privacy review/redaction/finalization, PR #455;
- K-CASE-008 acceptance infrastructure — TEST/LIVE-separated durable acceptance harness, PR #456;
- PR #470 — portable `CaseCandidateV1` JSON Schema/package subpath;
- PR #471 — fail-closed authenticated internal Candidate intake;
- PR #472 — request-bound authenticated MarkReg evidence collection;
- PR #473 — Formal Matter ID wire-contract fidelity.

The #456 harness does **not** make K-CASE-008 complete. TEST fixtures and injected transport are not live acceptance evidence.

Remaining blocker:

- K-CASE-002 — real MarkReg-side operator action equivalent to `Send to Knowledge Case`, tracked by #467.

That producer must create/reuse a valid Candidate from a real Formal Matter, preserve workspace/version/snapshot lineage, call the authenticated Knowledge intake/resolver boundaries, return an opaque producer promotion reference and remain idempotent. Knowledge must not invent a fake producer, read MarkReg persistence directly or manually reconstruct the matter.

After the producer exists, run one real K-CASE-008 matter through the already merged #456 path before starting K-CASE-009 refresh/versioning or K-CASE-010 matter-type expansion.

## ADK sequence and current role

- **ADK-00 through ADK-05 — Implemented.** Architecture, provider-neutral runtime, durable assignments/instructions, exact raw lineage, assignment graph and evidence-backed candidates.
- **ADK-06 — Implementation complete; paid/live acceptance OPEN.** #405 remains the acceptance ledger.
- **ADK-07 — Implemented and safety hardened.** Durable queue, explicit retries, ambiguous-delivery quarantine and CAS worker/recovery transitions.
- **ADK-08 through ADK-10 — Implemented.** Assignment libraries, governed promotion and jurisdiction libraries/catalog.
- **ADK-11 — Implemented through the current safety boundary.** Grounded SourcePack/binding, prompt rendering, citation validation/evidence, PREPARED envelopes, safe queue admission and explicit append-only provider authorization.

#405 is an infrastructure/live acceptance milestone, not the product roadmap. Do not create more ADK framework merely because the paid live run remains open.

## ADK-06 acceptance gate (#405)

#405 stays open until the actual live acceptance proves all frozen requirements, including:

- assignments `kas_us_trademark_filing`, `kas_us_trademark_section_8`, `kas_us_trademark_ttab`;
- providers `DEEPSEEK` + `OPENAI`;
- exact authorized `main` SHA;
- 6/6 real provider cells `EXECUTED`;
- twelve unique finalized RawArtifact receipts;
- no unresolved in-flight provider delivery;
- authenticated execution `COMPLETED`;
- no provider ranking/legal-truth/candidate auto-activation;
- encrypted evidence retained in authorized non-public durable storage beyond temporary Actions retention.

Do not execute the paid acceptance merely to advance the Case/Expert roadmap.

## Repository governance gate (#429)

The repository remains public and `main` remains unprotected at this checkpoint.

PR #460 added CODEOWNERS, but CODEOWNERS alone does not enforce review. #429 remains open until repository administration actually proves the required ruleset/main protection, workflow review controls, protected live secret/environment boundary where available, and durable non-public evidence retention.

## Current P0 engineering order

1. **K-CASE-002 / #467:** implement the real MarkReg-side `Send to Knowledge Case` producer in `yoomarks/markorbit` / `services/markreg`; do not create a Knowledge-local substitute.
2. **K-CASE-008:** after that producer exists, run one completed real Formal Matter through the existing #456 LIVE/default-HTTP path and prove idempotent end-to-end lineage.
3. **K-EXP-004 / #468:** once Shared Communication provides real send/reply identity, run one legitimate Expert Q&A vertical slice.
4. Keep shared Managed AI compatibility and drift guards healthy; do not add new Knowledge-local generic provider transports.
5. Only after real Case/Expert samples exist, advance K-CASE-009/010 and four-pillar federation based on observed production behavior.
6. Close #429 only with real repository-settings evidence; run #405 only when its operational gates and secret/evidence controls are genuinely ready.

## Current stop/go decisions

### GO

- real MarkReg -> Knowledge Case producer integration;
- first real Case Dossier acceptance;
- shared Communication needed by Expert;
- first real Expert source slice;
- provenance/durability/retrieval/interoperability required by real four-pillar sources;
- maintenance of the proven Managed AI compatibility boundary.

### STOP / DEFER

- additional Knowledge-local generic AI provider transports;
- additional Knowledge-local mailbox/provider platform features;
- Web Capability extraction or broad Web expansion ahead of current blockers;
- K-CASE-009/010 before the first real K-CASE-008 slice;
- another Case acceptance framework instead of #456;
- Knowledge-local fake MarkReg producer/resolver/credentials;
- direct MarkReg database/persistence reads;
- manual reconstruction of MarkReg matters;
- fake live Expert send/reply evidence;
- correspondence/payment ingestion without a proven owner/auth/evidence boundary;
- provider/expert/source ranking as truth selection;
- Case lessons/recommendations/predictions/legal-truth certification;
- universal Case ontology before real dossiers justify it.

## Engineering operating rule

**抓大放小.** Prefer durable end-to-end information assets and real source flows over micro-frameworks and speculative abstraction.

Before accepting a material task, ask whether it strengthens one of the four pillars, completes the shared AI/Communication capability boundary, or materially improves provenance/durability/retrieval/interoperability required by those pillars. If not, defer it unless it fixes a production defect, security gap or governance risk.
