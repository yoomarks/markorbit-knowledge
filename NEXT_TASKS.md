# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-25  
**Current main:** `64e4722d5068c7c6a55fa394c92ab0f096a9229c`  
**Original audit baseline:** `a5fef459a5a681e2f7159971c87374c6625f4776`

This file is a short execution pointer. The canonical detailed plan is `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`.

## Completed in the current execution stage

### K-CAP-AI-001 — Knowledge-side migration audit

- current DeepSeek/OpenAI provider runtime was classified into shared transport vs Knowledge source semantics vs governance-only concerns;
- `yoomarks/markorbit/packages/ai` was verified during the audit as a thin starting package, not an already implemented gateway;
- migration surface is frozen in `docs/architecture/AI_CAPABILITY_MIGRATION_MATRIX_2026-08-25.md`.

**Dependency:** K-CAP-AI-002/003 must exist in `yoomarks/markorbit` before Knowledge can build K-CAP-AI-004 compatibility bridge.

### K-CAP-COMM-002 — Legacy IMAP safety audit

- TLS/read-only semantics, UID/UIDVALIDITY, cursor-after-COMPLETE, restart checkpoints, hash replay, secret separation, and immutable RFC822 evidence boundaries were audited;
- missing shared features such as outbound idempotency, thread correlation and attachment identity were recorded;
- checklist is frozen in `docs/architecture/COMMUNICATION_CAPABILITY_MIGRATION_CHECKLIST_2026-08-25.md`.

### K-CASE-000 — discovery pass completed, blocker remains

- all currently accessible `yoomarks` repositories were checked during the discovery pass;
- no MarkReg repository/module or authoritative matter interface was found;
- unresolved facts and required future discovery receipt are recorded in `docs/architecture/MARKREG_BOUNDARY_AUDIT_2026-08-25.md`.

**Hard rule:** do not invent a MarkReg API, matter ID, or replacement case system.

### K-EXP-001 — Expert source contracts

- `ExpertQuestionTaskV1` and `ExpertSourceRecordV1`;
- lifecycle state machine and access classification;
- opaque shared-Communication send/thread/message correlation refs;
- attachment/source/case refs;
- validators that reject expert ranking, truth scoring and recommendation fields.

### K-EXP-002 — Expert persistence and replay idempotency

- durable SQLite Expert task/source repositories;
- exact question identity locks once sent;
- stable Communication send-request and thread correlation;
- immutable send timestamps and source records;
- repeated inbound evidence replay deduplicates deterministically;
- changed replay semantics fail closed;
- multiple reply/follow-up evidence can remain linked without overwriting the original evidence.

### K-EXP-003 — Expert Q&A operator workbench

- `/experts` operator workbench and Expert task APIs;
- Draft → Ready → Waiting → Replied → Captured → Closed workflow;
- reply evidence and attachment inspection;
- follow-up questions become separate durable tasks;
- Knowledge exposes only an `ExpertQuestionSender` domain port;
- production sending remains deliberately fail-closed until the shared Communication Capability is connected.

**Not claimed:** K-EXP-004 live Expert acceptance. No real send/reply has been fabricated.

### K-EXP-005 — Expert source retrieval

- versioned Expert retrieval request/result contracts;
- read-only retrieval over the durable Expert source registry;
- filters for jurisdiction, topic, expert, organization, received window, related source and related case;
- deterministic pagination;
- `/api/expert-sources` and retrieval UI in `/experts`;
- original raw evidence refs, communication refs, attachments, provenance and access classification remain visible in results.

## Current P0 order

### P0-1 — Re-audit main-repo AI Capability, then implement K-CAP-AI-004 when available

Repository dependency: `yoomarks/markorbit`

Expected upstream scope remains K-CAP-AI-002/003:

1. minimal `@markorbit/ai` invocation/result/error contract;
2. first real provider: OpenAI;
3. exact raw response preserved;
4. explicit timeout/network delivery uncertainty;
5. no automatic replay of ambiguous paid calls;
6. no KnowledgeAssignment/SourcePack/Brain semantics in the shared package.

Knowledge must re-check the current main-repo state before assuming this dependency is still absent. If upstream is ready, implement K-CAP-AI-004 compatibility bridge; otherwise remain blocked rather than creating another Knowledge-local generic provider transport.

### P0-2 — Re-audit shared Communication, then implement K-CAP-COMM-005 when available

Repository dependency: `yoomarks/markorbit`

Expected upstream scope remains K-CAP-COMM-001/003/004:

- reusable account binding;
- idempotent outbound send;
- inbound sync;
- canonical message/thread/attachment identity;
- restart-safe cursor;
- reply correlation;
- delivery uncertainty;
- no credential leakage.

Once the real upstream capability exists, Knowledge should wire the existing `ExpertQuestionSender` port and inbound correlation to it, document legacy email retirement conditions, and keep all provider credentials/transport outside Knowledge.

### P0-3 — K-EXP-004 first live Expert vertical slice

Blocked until K-CAP-COMM-005 is connected.

Acceptance must use one legitimate professional question and retain evidence for:

- outgoing question;
- shared Capability send identity;
- incoming reply;
- correlated thread/message refs;
- captured attachments if any;
- immutable Expert source record;
- replay deduplication;
- no expert ranking or truth scoring.

Do not perform a fake/local-only send to mark this complete.

### P0-4 — Resolve real MarkReg location

K-CASE-000 remains an external discovery gate. Obtain authoritative runtime/repository/service facts and write the discovery receipt before any producer-specific Case Candidate integration.

## Operational gates kept open, not expanded

- issue #405 remains the real ADK-06 3×2 live-provider acceptance;
- issue #429 remains repository governance for protected main, live secrets/environment, and durable encrypted evidence retention;
- as observed on 2026-08-25, the Knowledge `main` branch is not protected, so #429 is still materially unresolved;
- do not execute paid #405 merely to advance the product roadmap;
- do not build more generic ADK framework around these open gates.

## STOP / DEFER

- new Knowledge-local generic AI provider transports;
- new Knowledge-local mailbox/provider platform features;
- pretending K-EXP-004 is complete without a real shared-Communication send/reply path;
- Web Capability extraction;
- provider count as KPI;
- expert/provider/source ranking;
- legal-truth certification;
- lessons/recommendations/predictions in Knowledge;
- manual reconstruction of MarkReg matters;
- universal Case ontology before real dossiers.
