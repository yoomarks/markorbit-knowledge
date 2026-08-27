# MarkOrbit Knowledge — Next Tasks

**Canonical direction:** Web / AI / Expert / Case four-pillar Knowledge strategy  
**Checkpoint:** 2026-08-28  
**Latest audited Knowledge main before this docs branch:** `8ffd26b4e86bacdb47790956d66b999f29ad95d7`  
**Latest audited MarkOrbit/Core main:** `4a094c8ba81c557c5528b9dc9b04eaab3d8032f6`

This is the short execution pointer. Older Case/Communication blocker statements are superseded by the current GitHub issue state and `docs/project/CURRENT_STATE.md`.

## Completed / frozen in the current stage

### Shared AI

- Shared Managed AI transport/runtime belongs in MarkOrbit/Core Capability.
- Knowledge keeps assignment/source semantics, exact raw evidence, provenance, RawArtifact lineage, recovery and no-legal-truth boundaries.
- Cross-repository non-live HTTP acceptance and Core-ref drift guards are already established.
- #405 remains the separate paid/live ADK-06 acceptance gate; non-live success is not provider-live evidence.

### Shared Communication / Expert

- K-EXP-001/002/003/005 are complete.
- Core Shared Communication now exposes governed outbound send, durable send/thread identity, idempotency, fail-closed uncertain-delivery reconciliation and authenticated thread evidence resolution.
- Knowledge PR #538 merged the outbound consumer seam; #539 imported same-thread Expert replies; #540 requires exact Core evidence for Expert replies.
- #468 remains open only for the real production vertical slice: concrete deployed sender/account, one real Expert send, one real same-thread reply with immutable raw evidence, and replay/no-duplicate proof.
- Do not build a Knowledge-local generic email/messaging transport.

### Case

- Former producer dependency #467 is closed/completed.
- Do not continue using the old plan that treats `Send to Knowledge Case` as the primary blocker.
- Preserve the permanent ownership boundary: MarkReg owns operational matter state; Knowledge consumes authorized immutable evidence and does not read MarkReg persistence directly or reconstruct a second matter system.
- Any next Case work must be justified by real production dossier behavior, refresh/versioning needs or evidence/interoperability gaps.

### Knowledge Graph / retrieval

Merged stage now includes:

- KG-006 Related / Backlinks;
- KG-007 bounded local 1-hop/2-hop graph;
- KG-008 hybrid search + graph navigation;
- KG-009 provider-neutral relationship API;
- KG-010 explicit LEXICAL / GRAPH / VECTOR composition;
- #544 exact lexical chunk identity/hash lineage in composed retrieval;
- #546 deterministic retrieval evaluation harness.

The retrieval evaluator reports document recall@k, exact chunk hit rate, lexical provenance completeness and graph-expansion noise without blended scoring or synthetic provider/vector metrics.

### Repository governance

- Active ruleset `Protect main` requires PR-based changes, blocks deletion/non-fast-forward updates, requires review-thread resolution and requires `autoformat`, `validate (22)` and `validate (24)`.
- No ruleset bypass actors are configured.
- ADK live execution is bound to `adk-live` according to owner-side verification.
- #429 remains open only for required Code Owner approval enforcement and durable non-public archive closeout after a successful #405 run.

## Current P0 order

### P0-1 — Retrieval evaluation: real frozen corpus/query runner

Build on #546 rather than creating another retrieval framework.

Required direction:

- wire a versioned real-corpus fixture and representative frozen research questions;
- preserve canonical document identity plus exact chunk/hash expectations;
- compare metadata/filter baseline, lexical-only and lexical+relationship variants deterministically;
- add a vector variant only when a real provider is deliberately configured;
- preserve channel-native evidence and do not create a blended relevance score;
- keep provider cost/latency as observed runner outputs, never synthetic fixture values.

Before implementation, verify that the work still belongs in Knowledge and does not move semantic interpretation or business-intelligence judgment from Brain into Knowledge.

### P0-2 — Expert real live vertical slice (#468)

Code integration is largely complete. Before attempting the live slice, re-audit the exact current Core main and the production communication deployment.

Acceptance still requires:

- one legitimate existing `ExpertQuestionTaskV1` sent once through Shared Communication;
- durable Core send/thread receipt persisted against the task;
- one real inbound reply correlated to the same thread/task;
- immutable provenance-bearing raw reply evidence and attachment lineage where present;
- resulting `ExpertSourceRecordV1` retrievable with exact communication lineage;
- replay proves no duplicate send or imported source;
- uncertainty remains operator-visible and fail-closed.

No fake sender, fake reply or normalized-text-only substitute counts.

### P0-3 — Governance closeout (#429)

Do not redo protected-main work. Remaining acceptance is narrow:

1. enforce/verify required Code Owner approval for workflow/CODEOWNERS changes;
2. after successful #405, retain encrypted evidence and integrity manifest in authorized non-public durable storage outside Actions retention.

### P0-4 — ADK-06 live 3×2 acceptance (#405)

Do not execute merely to keep development moving.

Run only when all operational gates are actually ready: DeepSeek/OpenAI credentials, explicit cost authorization, protected `adk-live` approval, exact current Knowledge main SHA, evidence passphrase and a defined durable non-public archive destination.

Final acceptance remains 3 assignments × 2 real providers = 6 executed cells, twelve unique finalized RawArtifact receipts, no unresolved in-flight delivery and authenticated execution `COMPLETED`.

## Do not start merely to keep coding

- another generic retrieval framework after #546;
- blended cross-channel relevance/truth scoring without explicit governed ownership;
- Knowledge-local generic AI provider transport;
- Knowledge-local generic mailbox/provider platform;
- fake live Expert communication evidence;
- direct MarkReg DB/persistence reads;
- manual Case reconstruction or another Case acceptance framework;
- source/provider/expert ranking as truth selection;
- legal-truth certification, prediction, recommendation or strategy inside Knowledge;
- broad Web capability extraction/expansion without a concrete production gap;
- paid/live #405 merely for roadmap progress.

## Operational gates kept open

- #405 — real paid/live ADK-06 acceptance;
- #429 — Code Owner enforcement + durable evidence archive closeout;
- #468 — one real Expert send→reply→source acceptance;
- retrieval quality — continue from #546 with real frozen corpus/query evidence, not speculative abstractions.

## Operating rule

**抓大放小.** Prefer exact lineage, real source flows, measurable retrieval quality and durable cross-system evidence over additional framework surface.
