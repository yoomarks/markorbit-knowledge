# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `ed43351fe29c6392db0d57dc381cb56f964ade3b`  
**Latest audited MarkOrbit main:** `26eaf35545bb1044f84a78d659fbdc408bc7582f`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed / frozen in the current execution stage

### Shared AI migration — K-CAP-AI-001 + K-CAP-AI-004 boundary

- Knowledge-side provider/semantics split is frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- main repo now contains the provider-neutral Managed AI contract/runtime plus the first DeepSeek adapter;
- Knowledge main now contains `managed-ai-knowledge-adapter.ts` and parity tests that map the shared Managed AI contract back into existing Knowledge acquisition semantics;
- the bridge preserves exact output/provenance and rejects authority escalation;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** a paid/live #405 acceptance or a new concrete cross-repository HTTP execution endpoint. Keep the live-provider acceptance and transport/governance questions separate from the parity bridge.

### Shared Communication audit — K-CAP-COMM-002

- legacy IMAP TLS/read-only, UID/UIDVALIDITY, cursor-after-COMPLETE, restart/hash replay and secret boundaries are frozen;
- main-repo MO-CAP-003 Managed Communication remains planning-only at the latest audit;
- no shared production send/thread/attachment capability was found yet.

### Expert V1 — K-EXP-001/002/003/005

Completed in Knowledge:

- Expert task/source contracts and anti-ranking/truth/recommendation validators;
- durable persistence and replay idempotency;
- `/experts` operator workflow with fail-closed send boundary;
- provenance-preserving Expert source retrieval and filtering.

**Still blocked:** K-EXP-004 live Expert slice requires real Shared Communication send/reply correlation. Do not fabricate SENT/reply evidence.

### K-CASE-000 — real MarkReg boundary resolved for contract design

A fresh source audit located the authoritative producer at `yoomarks/markorbit/services/markreg`.

Frozen facts now include:

- canonical `FormalMatterId = formal-matter_${string}`;
- Workspace scope;
- Formal Matter version + immutable source snapshot + `snapshotSha256`;
- real `/v1/formal-matters` read surface;
- lifecycle current view/event provenance surface;
- durable Document Package evidence references/checksums;
- internal service secret + Workspace Principal + explicit permission model;
- no dedicated correspondence model found yet.

See `docs/architecture/MARKREG_BOUNDARY_AUDIT_2026-08-25.md`.

Repository fixtures are **not** accepted as a live completed Case. K-CASE-008 remains the real-matter acceptance stage.

### K-CASE-001 — Case Candidate V1 contract

This branch introduces the narrow producer-aware Knowledge contract:

- candidate ID;
- source system fixed to `MARKREG`;
- exact Formal Matter ID/version/snapshot SHA;
- opaque authorized source retrieval ref;
- promotion actor/time and optional operator case-value note;
- Workspace-scoped access classification;
- idempotency key;
- deterministic natural identity based only on source system/workspace/matter/version/snapshot.

No dossier ontology, lesson, recommendation, truth score or manual case re-entry is introduced.

## Current P0 order

### P0-1 — K-CASE-003 Knowledge Case Candidate intake

Repository: `yoomarks/markorbit-knowledge`

After K-CASE-001 merges, implement durable intake that:

1. validates `CaseCandidateV1`;
2. enforces unique natural source identity;
3. reuses the same candidate on replay;
4. rejects changed semantics for the same idempotency key/source snapshot;
5. records source retrieval/snapshot references without copying MarkReg operational tables;
6. exposes intake state for a future MarkReg one-click producer action;
7. handles source-unavailable state without inventing evidence.

This can proceed entirely in Knowledge and does not require a MarkReg UI write.

### P0-2 — K-CASE-002 MarkReg one-click promotion UX

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required product action remains:

> Send to Knowledge Case

This is a cross-repository write and is **not authorized by the current Knowledge takeover permission**. Do not implement it in Knowledge or invent a producer endpoint. Once explicitly authorized on the main repo, wire it to the real Knowledge K-CASE-003 intake contract.

### P0-3 — K-CASE-004 authorized evidence collection adapters

After candidate intake and a real producer handoff path exist, collect/reference only proven authorized matter material:

- Formal Matter snapshot/metadata;
- lifecycle events/provenance;
- Document Package evidence refs;
- correspondence only through a proven Communication/MarkReg evidence interface;
- fee/payment evidence only when the owning source and authorization are explicit.

Reuse RawArtifact/provenance primitives; do not create a parallel operational evidence store.

### P0-4 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Operational gates kept open, not expanded

- issue #405 remains real ADK-06 live-provider acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains materially unresolved: Knowledge `main` was still observed unprotected during this checkpoint;
- do not treat the Managed AI parity bridge as evidence that #405/#429 are complete.

## STOP / DEFER

- new Knowledge-local generic AI provider transports;
- new Knowledge-local mailbox/provider platform features;
- fake live Expert send/reply evidence;
- direct reads of MarkReg database/persistence;
- manual reconstruction of MarkReg matters in Knowledge;
- invented MarkReg promotion HTTP route;
- universal Case ontology before real dossiers;
- Case lessons/recommendations/predictions or legal-truth certification;
- Web Capability extraction until the higher-value Case/Communication dependencies are addressed.
