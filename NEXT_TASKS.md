# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Latest audited Knowledge main before this branch:** `ff9b1e731e216ad745edb61e3c62625d39e19526`  
**Latest audited MarkOrbit main:** `cf25a7b6f594f431e40196e810841baa522fb35c`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed / frozen in the current execution stage

### Shared AI migration — K-CAP-AI-001 + K-CAP-AI-004 boundary

- Knowledge-side provider/semantics split is frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`;
- main repo contains the provider-neutral Managed AI contract/runtime, DeepSeek adapter and a newer managed executor on the latest audited main;
- Knowledge contains `managed-ai-knowledge-adapter.ts` and parity tests mapping the shared Managed AI contract back into existing Knowledge acquisition semantics;
- the bridge preserves exact output/provenance and rejects authority escalation;
- ambiguous delivery remains reconciliation-required rather than automatically replayed.

**Not claimed:** a paid/live #405 acceptance or a concrete production cross-repository Managed AI transport acceptance. Keep live-provider acceptance and transport/governance evidence separate from contract/runtime progress.

### Shared Communication audit — K-CAP-COMM-002

- legacy IMAP TLS/read-only, UID/UIDVALIDITY, cursor-after-COMPLETE, restart/hash replay and secret boundaries are frozen;
- no verified shared production send/thread/attachment capability is used by Knowledge yet;
- K-EXP-004 remains blocked until real Shared Communication send/reply correlation exists.

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
- real `/v1/formal-matters/:formalMatterId` read surface;
- real `/v1/operations/formal-matters/:formalMatterId/lifecycle-provenance` operations surface returning current view/events/recommended-action provenance;
- durable Document Package evidence references/checksums;
- internal service secret + encoded Workspace Principal + explicit permission model;
- lifecycle provenance requires `review:perform`;
- no dedicated correspondence model found yet.

See `docs/architecture/MARKREG_BOUNDARY_AUDIT_2026-08-25.md`.

Repository fixtures are **not** accepted as a live completed Case. K-CASE-008 remains the real-matter acceptance stage.

### K-CASE-001 — Case Candidate V1

Merged in #450.

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

Merged in #451 on Knowledge main `ff9b1e731e216ad745edb61e3c62625d39e19526`.

Knowledge now has:

- durable Candidate persistence in the existing registry SQLite database;
- separate idempotency command ledger;
- exact source-snapshot dedupe;
- source semantics conflict detection;
- durable `PENDING` / `WAITING_SOURCE` collection state;
- explicit requeue for source-unavailable work;
- Admin `POST /api/case-candidates` intake plus read/pending `GET` surface;
- HTTP 202 intake semantics because queue acceptance is not evidence collection completion.

### K-CASE-004 — authorized MarkReg evidence collection adapters

This branch implements the first Knowledge-owned evidence collection slice against only verified MarkReg read surfaces:

- versioned `CaseEvidenceCollectionV1` exact-evidence contract;
- exact JSON bytes, byte length and SHA-256 retained for admitted MarkReg responses;
- Formal Matter ID/version/snapshot SHA is revalidated before evidence admission;
- lifecycle provenance is collected from the real operations route when authorized;
- matching Document Package payloads are retained with source Formal Matter version/hash and MarkReg storage/checksum metadata inside the exact source response;
- optional 401/403/404 lifecycle/document surfaces become explicit omissions rather than fabricated data;
- retryable MarkReg network/5xx failures move the Candidate to `WAITING_SOURCE`;
- durable immutable evidence persistence and replay dedupe;
- `COLLECTED` intake state points at the immutable evidence collection and cannot be requeued/overwritten;
- Admin composition service wires durable Candidate -> trusted resolver -> authenticated MarkReg collector -> durable evidence -> `COLLECTED`;
- the trusted resolver is mandatory and injected; Knowledge does not derive credentials or decode the opaque `sourceRetrievalRef` itself.

**Important boundary:** this branch does not claim a live production resolver binding or K-CASE-008 real-matter acceptance. The MarkReg producer/auth handoff must supply a legitimate resolver/principal path. It also does not invent correspondence or broader payment evidence sources.

RawArtifact was reviewed but not reused for these internal MarkReg API snapshots because its current write path is coupled to Web collection leases/source-registry execution context. Forcing MarkReg evidence through that path would fabricate the wrong provenance. The exact MarkReg snapshot repository is therefore a bounded Case-specific evidence store, not a replacement operational matter store.

## Current P0 order

### P0-1 — K-CASE-005 Case Dossier V1 schema

Repository: `yoomarks/markorbit-knowledge`

Use the evidence shapes now proven by K-CASE-004 to implement the versioned objective dossier defined in `CASE_DOSSIER_AND_EXPERT_SOURCE_ARCHITECTURE.md`:

1. identity/background;
2. process/timeline;
3. document/evidence references;
4. money/time only where the frozen MarkReg evidence actually supplies facts;
5. outcome only when supported by source evidence;
6. provenance/access/privacy;
7. dossier version/completeness.

Do not create lessons, recommendations, success probability, legal-truth scores or a universal global case ontology.

### P0-2 — K-CASE-002 MarkReg one-click promotion + trusted resolver binding

Repository/system: `yoomarks/markorbit` / `services/markreg` + relevant UI/Gateway.

Required product action remains:

> Send to Knowledge Case

The producer must create/reuse a valid `CaseCandidateV1` and supply a legitimate server-side path by which the opaque `sourceRetrievalRef` resolves to MarkReg URL + Workspace scope + internal authorization + Workspace Principal.

This is a cross-repository write and is **not authorized by the current Knowledge takeover permission**. Do not implement it in Knowledge or invent credentials/producer endpoints.

### P0-3 — K-CASE-006 deterministic objective dossier assembly

After K-CASE-005 schema lands, assemble the dossier deterministically from immutable Case evidence. AI drafting remains derivative-only and must preserve source references if introduced later through shared AI Capability.

### P0-4 — K-CASE-007 privacy/redaction workflow

Implement access classification, redacted derivatives, original-vs-redacted lineage and reviewer state before broader Case reuse.

### P0-5 — K-CASE-008 first real Case Dossier

Requires one completed real MarkReg matter and a legitimate producer/auth resolver path. Fixtures are not acceptance evidence.

### P0-6 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication. Acceptance requires real outgoing send identity, real reply/thread correlation, immutable raw evidence and replay dedupe.

## Operational gates kept open, not expanded

- issue #405 remains real ADK-06 live-provider acceptance; do not run paid acceptance merely to advance roadmap;
- issue #429 remains materially unresolved: Knowledge `main` is still observed unprotected at this checkpoint;
- the audited MarkOrbit `main` is also currently unprotected;
- do not treat Managed AI runtime progress as evidence that #405/#429 are complete.

## STOP / DEFER

- new Knowledge-local generic AI provider transports;
- new Knowledge-local mailbox/provider platform features;
- fake live Expert send/reply evidence;
- direct reads of MarkReg database/persistence;
- manual reconstruction of MarkReg matters in Knowledge;
- invented MarkReg promotion HTTP route or credentials;
- correspondence capture until a proven MarkReg/Communication source exists;
- payment-service ingestion until owner/auth/evidence semantics are frozen;
- universal Case ontology before real dossiers;
- Case lessons/recommendations/predictions or legal-truth certification;
- Web Capability extraction until higher-value Case/Communication dependencies are addressed.
