# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Baseline audited:** `yoomarks/markorbit-knowledge@a5fef459a5a681e2f7159971c87374c6625f4776`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed in the current execution stage

### K-CAP-AI-001 — Knowledge-side migration audit

- current DeepSeek/OpenAI provider runtime was classified into shared transport vs Knowledge source semantics vs governance-only concerns;
- `yoomarks/markorbit/packages/ai` was verified to be a thin starting package, not an already implemented gateway;
- migration surface is frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`.

**Next dependency:** K-CAP-AI-002/003 must be implemented in `yoomarks/markorbit` before Knowledge can build K-CAP-AI-004 compatibility bridge.

### K-CAP-COMM-002 — Legacy IMAP safety audit

- TLS/read-only semantics, UID/UIDVALIDITY, cursor-after-COMPLETE, restart checkpoints, hash replay, secret separation, and immutable RFC822 evidence boundaries were audited;
- missing shared features such as outbound idempotency, thread correlation and attachment identity were recorded;
- checklist is frozen in `docs/architecture/COMMUNICATION_CAPABILITY_MIGRATION_CHECKLIST_2026-08-25.md`.

### K-CASE-000 — discovery pass completed, blocker remains

- all currently accessible `yoomarks` repositories were re-checked;
- no MarkReg repository/module or authoritative matter interface was found;
- unresolved facts and required future discovery receipt are recorded in `docs/architecture/MARKREG_BOUNDARY_AUDIT_2026-08-25.md`.

**Hard rule:** do not invent a MarkReg API, matter ID, or replacement case system.

### K-EXP-001 — Expert source contracts

- `ExpertQuestionTaskV1`;
- `ExpertSourceRecordV1`;
- lifecycle state machine;
- opaque shared-Communication correlation refs;
- attachment/source refs;
- access classification;
- validators that reject expert ranking/truth/recommendation fields;
- deterministic contract tests.

## Current P0 order

### P0-1 — Main repo AI Capability V1

Repository: `yoomarks/markorbit`

Implement K-CAP-AI-002 and K-CAP-AI-003 using the frozen migration matrix:

1. minimal `@markorbit/ai` invocation/result/error contract;
2. first real provider: OpenAI;
3. exact raw response preserved;
4. explicit timeout/network delivery uncertainty;
5. no automatic replay of ambiguous paid calls;
6. no KnowledgeAssignment/SourcePack/Brain semantics in the shared package.

After that, return the exact main-repo PR/commit so Knowledge can implement K-CAP-AI-004.

### P0-2 — Main repo Communication Capability V1

Repository: `yoomarks/markorbit`

Implement K-CAP-COMM-001/003/004 from the migration checklist:

- reusable account binding;
- idempotent outbound send;
- inbound sync;
- canonical message/thread/attachment identity;
- restart-safe cursor;
- reply correlation;
- delivery uncertainty;
- no credential leakage.

After that, Knowledge can wire the Expert vertical slice.

### P0-3 — K-EXP-002 persistence and idempotency

Repository: `yoomarks/markorbit-knowledge`

Once K-EXP-001 contracts are merged, implement durable repositories with these invariants:

- exact question becomes immutable once sent;
- stable communication send request reference;
- repeated inbound replay does not create duplicate Expert source records;
- one task may correlate multiple follow-up messages;
- original raw evidence remains authoritative;
- normalized derivative remains separate;
- no expert/truth ranking fields.

This work can proceed while shared Communication is being implemented, as long as no new Knowledge-owned mail transport is added.

### P0-4 — Resolve real MarkReg location

K-CASE-000 remains a real external discovery gate. Obtain authoritative runtime/repository/service facts and write the discovery receipt before any producer-specific Case Candidate integration.

## Operational gates kept open, not expanded

- issue #405 remains the real ADK-06 3×2 live-provider acceptance;
- issue #429 remains repository governance for protected main, live secrets/environment, and durable encrypted evidence retention;
- do not execute paid #405 merely to advance the product roadmap;
- do not build more generic ADK framework around these open gates.

## STOP / DEFER

- new Knowledge-local generic AI provider transports;
- new Knowledge-local mailbox platform features;
- Web Capability extraction;
- provider count as KPI;
- expert/provider/source ranking;
- legal-truth certification;
- lessons/recommendations/predictions in Knowledge;
- manual reconstruction of MarkReg matters;
- universal Case ontology before real dossiers.
