# MarkOrbit Knowledge — Current Engineering State

Checkpoint date: 2026-08-28

This is the canonical engineering handoff entry point. It records a verified checkpoint, not a permanently current branch pointer. Re-verify GitHub `main`, open PRs/issues, and any paid/live gate before protected or external execution.

## Verified baseline

- Repository: `yoomarks/markorbit-knowledge`
- Verified Knowledge `main`: `8ffd26b4e86bacdb47790956d66b999f29ad95d7`
- Latest merged Knowledge PR: #546 — deterministic retrieval evaluation harness
- Latest audited MarkOrbit/Core `main`: `4a094c8ba81c557c5528b9dc9b04eaab3d8032f6`
- Open paid/live acceptance gate: #405 — ADK-06 real 3×2 provider acceptance
- Open repository-governance closeout: #429 — Code Owner enforcement plus durable non-public live-evidence archive
- Open Expert live acceptance ledger: #468 — one real send → reply → immutable evidence vertical slice
- Open retrieval-quality lane after #546: continue only with evidence-backed frozen corpus/query evaluation, not speculative retrieval framework expansion
- Former Case producer dependency #467 is closed/completed and must not be treated as an active P0 blocker.

## Canonical strategic direction

The product direction is Web / AI / Expert / Case, with Knowledge preserving objective information and Brain owning interpretation, evaluation, recommendation and protected decision semantics.

Knowledge owns acquisition, preservation, structure, relationships, update/version lineage, retrieval and evidence provenance. Knowledge does not own source/provider/expert truth ranking, legal-truth certification, prediction, recommendation, strategy or protected decisions.

For Knowledge, an AI answer or Expert reply is acquired source evidence. For Brain, AI may additionally be used as a reasoning tool. Do not collapse those responsibilities.

## Four pillars

### Web

Public web, official sources, documents, APIs, feeds, media and structured public information remain inside Knowledge. Do not migrate or broadly expand Web acquisition merely to create more framework surface.

### AI

The shared Managed AI boundary is materially proven. Knowledge retains assignment/source semantics, exact raw evidence, RawArtifact lineage, provenance and recovery; generic AI transport/runtime belongs in shared MarkOrbit Capability.

ADK-06 implementation is complete but paid/live acceptance remains open in #405. Non-live cross-repository acceptance is not live provider evidence.

### Expert

Knowledge-owned Expert contracts, persistence, workbench, retrieval, outbound Shared Communication integration and same-thread inbound import are implemented.

Core Shared Communication now provides governed outbound send identity, durable send/thread receipts, idempotency, fail-closed delivery uncertainty reconciliation and authenticated thread resolution. Knowledge PRs #538/#539/#540 consume that boundary without adding a Knowledge-local mail/provider stack.

#468 therefore no longer tracks a missing generic Shared Communication implementation. It now remains open only for a real production vertical slice proving one legitimate Expert question is sent through a concrete deployed sender/account, one real same-thread Expert reply is imported with immutable provenance-bearing evidence, and replay creates no duplicate send or source record.

### Case

The MarkReg producer dependency tracked by #467 is closed/completed. The Knowledge Case foundation and producer/consumer integration must therefore not be re-planned from the old 2026-08-25 blocker state.

The permanent boundary still stands: authoritative operational matter state belongs to MarkReg; Knowledge must not directly read MarkReg persistence, manually reconstruct a second matter system, fabricate correspondence/payment evidence, or convert MarkReg recommended actions into Knowledge conclusions.

Further Case refresh/versioning or matter-type abstraction should be driven by real dossier behavior and observed production needs rather than another acceptance framework.

## Knowledge Graph and retrieval state

Current merged retrieval/graph state includes:

- KG-006 — Related / Backlinks reader surface;
- KG-007 — bounded 1-hop/2-hop local Knowledge Graph View;
- KG-008 — hybrid Knowledge search with graph navigation;
- KG-009 — provider-neutral Knowledge Relationship API;
- KG-010 — explicit LEXICAL / GRAPH / VECTOR retrieval composition with channel-native provenance and no blended score;
- #544 — exact lexical chunk identity/hash lineage propagated through composed retrieval;
- #546 — deterministic retrieval evaluation harness reporting document recall@k, exact chunk hit rate, provenance completeness and graph-expansion noise.

Do not invent blended relevance semantics or synthetic vector/provider metrics. The next retrieval-quality work should use frozen real corpus/query fixtures and exact source/chunk expectations, then compare channel variants only when backed by real provider execution.

## Repository governance (#429)

Repository ruleset `Protect main` is active for the default branch. It enforces PR-based changes, blocks deletion and non-fast-forward updates, requires review-thread resolution and requires `autoformat`, `validate (22)` and `validate (24)`. There are no bypass actors.

The ADK-06 live workflow is bound to the `adk-live` protected Environment according to owner-side verification, with approval/secret isolation in place.

#429 remains open only for the remaining governance closeout:

1. verify/enforce required Code Owner approval for `.github/workflows/**` / CODEOWNERS;
2. after successful #405 execution, retain the encrypted evidence bundle and manifest in authorized non-public durable storage outside temporary GitHub Actions retention.

Do not reopen already-resolved protected-main/ruleset work.

## Current engineering order

1. Keep the retrieval-quality lane disciplined: after #546, add only frozen real-corpus/query evaluation and measured variants that preserve exact lineage and channel-native evidence.
2. Re-audit #468 only against the current Core exact head before any live Expert run; code integration is largely complete, while production sender/account and real reply evidence remain the acceptance gap.
3. Keep #405 operationally blocked until provider credentials, cost authorization, exact current main SHA, protected environment approval and durable evidence archive are genuinely ready.
4. Close #429 only with actual Code Owner enforcement plus durable archive evidence; do not substitute documentation for repository settings or archive proof.
5. Advance Case or Web work only when it closes a real production evidence/retrieval/interoperability gap.

## Stop / defer

- new Knowledge-local generic AI transports;
- new Knowledge-local generic mailbox/provider stack;
- fake live Expert send/reply evidence;
- blended cross-channel truth/relevance scores without an explicit governed design;
- source/provider/expert ranking as truth selection;
- direct MarkReg database reads or manual matter reconstruction;
- another Case acceptance framework;
- speculative universal Case ontology;
- broad Web extraction/expansion without a concrete production need;
- paid/live #405 execution merely to advance roadmap optics.

## Engineering operating rule

**抓大放小.** Prefer durable end-to-end information assets, exact lineage, real source flows and measurable retrieval quality over micro-frameworks and speculative abstraction.
