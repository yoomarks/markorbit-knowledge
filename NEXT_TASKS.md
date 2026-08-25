# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `a24649c799100d9bdec395d06a22e85c859613d0`  
**Latest audited MarkOrbit main:** `26eaf35545bb1044f84a78d659fbdc408bc7582f`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed / frozen in the current execution stage

### Shared AI migration — K-CAP-AI-001 + K-CAP-AI-004 boundary

- Knowledge-side provider/semantics split is frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- main repo contains the provider-neutral Managed AI contract/runtime plus the first DeepSeek adapter;
- Knowledge contains `managed-ai-knowledge-adapter.ts` and parity tests mapping the shared Managed AI contract back into existing Knowledge acquisition semantics;
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

### K-CASE-000 — real MarkReg boundary resolved

The authoritative producer is `yoomarks/markorbit/services/markreg`.

Frozen facts include:

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

### K-CASE-001 — Case Candidate V1

Merged in #450 on Knowledge main `a24649c799100d9bdec395d06a22e85c859613d0`.

The contract freezes:

- source system `MARKREG`;
- exact Formal Matter ID/version/snapshot SHA;
- opaque authorized source retrieval ref;
- promotion actor/time and optional operator case-value note;
- Workspace-scoped access classification;
- idempotency key;
- deterministic natural identity based only on source system/workspace/matter/version/snapshot.

No dossier ontology, lesson, recommendation, truth score or manual case re-entry is introduced.

### K-CASE-003 — durable Knowledge Case Candidate intake

This branch implements the Knowledge-owned intake boundary:

- validates `CaseCandidateV1` before persistence;
- persists the candidate in the existing registry SQLite database;
- maintains a separate idempotency command ledger;
- deduplicates repeated promotion of the exact same MarkReg source snapshot even when a new candidate ID/note is supplied;
- rejects changed input for the same idempotency key;
- creates a durable `PENDING` collection ticket at acceptance time;
- preserves the candidate and records `WAITING_SOURCE` when the source is temporarily unavailable;
- supports explicit requeue without inventing or fabricating source evidence;
- exposes Admin `POST /api/case-candidates` intake and read/pending `GET` surface;
- returns HTTP 202 for intake because acceptance/queueing is not evidence collection completion.

**Not claimed:** K-CASE-004 evidence collection, K-CASE-002 MarkReg one-click producer UX, or a real completed Case Dossier.

## Current P0 order

### P0-1 — K-CASE-004 authorized evidence collection adapters

Repository: `yoomarks/markorbit-knowledge`

Build the first source collection adapter against only the frozen MarkReg surfaces:

1. resolve the candidate's authorized `sourceRetrievalRef`;
2. verify Formal Matter ID/version/snapshot SHA before admitting evidence;
3. capture/reference the immutable Formal Matter snapshot with provenance;
4. retrieve lifecycle events/provenance when authorized;
5. retrieve Document Package evidence metadata/storage refs when authorized;
6. on source outage, move the intake ticket to `WAITING_SOURCE` rather than fabricating data;
7. reuse RawArtifact/provenance primitives where source bytes are actually acquired;
8. keep correspondence excluded until a proven Communication/MarkReg interface exists.

Do not read MarkReg persistence directly.

### P0-2 — K-CASE-002 MarkReg one-click promotion UX

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required product action remains:

> Send to Knowledge Case

This is a cross-repository write and is **not authorized by the current Knowledge takeover permission**. Do not implement it in Knowledge or invent a producer endpoint. Once explicitly authorized on the main repo, wire it to the real Knowledge K-CASE-003 intake contract.

### P0-3 — K-CASE-005 Case Dossier V1 schema

After the first real K-CASE-004 collection slice proves which source facts are actually available, implement the versioned objective dossier sections already frozen in `CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`.

Do not front-run real evidence by creating a universal case ontology.

### P0-4 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Operational gates kept open, not expanded

- issue #405 remains real ADK-06 live-provider acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains materially unresolved: Knowledge `main` is still observed unprotected at this checkpoint;
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
