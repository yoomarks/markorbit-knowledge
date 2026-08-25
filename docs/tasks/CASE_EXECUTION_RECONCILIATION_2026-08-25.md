# MarkOrbit Knowledge — Case Execution Reconciliation

> Status: **CURRENT CASE EXECUTION CHECKPOINT**
>
> Effective: 2026-08-25
>
> Knowledge main verified at: `a8d495ca75fbf6489df9d75b818b6d9aa0e967ae`
>
> MarkOrbit main verified read-only at: `4473e4be2ba432332d546c04b44397cb3bba3137`

This document reconciles the Case workstream after PRs #450–#456. It supersedes stale K-CASE status statements in `docs/tasks/KNOWLEDGE_STRATEGIC_EXECUTION_PLAN.md`, especially the original baseline that said MarkReg could not be located. The long-term product boundaries and non-goals in that plan remain valid.

## 1. Current boundary

The authoritative Case producer is `yoomarks/markorbit/services/markreg`.

Verified producer facts include:

- canonical `FormalMatterId = formal-matter_${string}`;
- Workspace-scoped Formal Matter identity;
- immutable source snapshot with version and SHA-256;
- authenticated Formal Matter read surface;
- lifecycle current view and event provenance;
- lifecycle output that explicitly does not claim official status verification;
- durable Document Package evidence metadata, checksums and storage references;
- MarkReg Recommended Action remains advisory/execution-unauthorized data and is not a Knowledge Case conclusion;
- no dedicated MarkReg correspondence source model has been proven for Case;
- broader payment-service ingestion has not been frozen as part of this Case boundary.

Knowledge must not read MarkReg persistence directly, invent producer credentials, reconstruct matters manually, or infer missing producer evidence.

## 2. Completed Knowledge-owned Case foundation

### K-CASE-001 — Case Candidate V1 — complete

Merged in PR #450.

The Candidate contract freezes exact source matter/workspace/version/snapshot identity, source retrieval reference, promotion metadata, access classification and idempotency identity. Brain-style lessons, recommendations, predictions, truth scores and legal-truth claims are rejected.

### K-CASE-003 — durable Candidate intake — complete

Merged in PR #451.

Knowledge durably persists Candidate intake, deduplicates the same source snapshot, detects changed semantics under an existing idempotency key, supports `PENDING` / `WAITING_SOURCE` / semantic `COLLECTED` state and exposes Admin intake/read surfaces.

### K-CASE-004 — immutable MarkReg evidence collection — complete

Merged in PR #452.

Knowledge collects through an injected trusted resolver rather than direct MarkReg persistence access. Exact response bytes, byte length and SHA-256 are preserved. Formal Matter identity/version/snapshot are revalidated. Lifecycle and Document Package evidence can be collected, while optional unavailable/unauthorized sources remain explicit omissions. Retryable source failure becomes `WAITING_SOURCE` without manufacturing evidence.

### K-CASE-005 — evidence-backed Case Dossier V1 — complete

Merged in PR #453.

The Dossier aggregate contains objective source-backed Case information only. Populated facts must retain evidence references. Lessons, recommendations, best practices, success probability, truth/authority scoring and predictions are rejected by contract.

### K-CASE-006 — deterministic objective dossier assembly — complete

Merged in PR #454.

Assembly reuses the immutable K-CASE-004 evidence collection and performs no new MarkReg network request. Exact stored bytes/SHA are reverified before parsing. Candidate, collection and embedded producer lineage are revalidated. MarkReg `recommendedAction` is deliberately excluded from Case conclusions, and quote totals are not promoted into actual paid-fee evidence.

### K-CASE-007 — privacy review, redaction and finalization — complete

Merged in PR #455 on Knowledge main `d764e53dbb2c91a9d11e52433b505ea1919d02b8`.

The privacy layer preserves the immutable internal Dossier and original evidence, uses explicit human-review states, stores append-only review events, builds redacted audience derivatives from the internal Dossier, excludes evidence/storage/source identifiers from audience derivatives by construction, and never treats `FINALIZED` as publication authorization.

### K-CASE-008 acceptance harness — infrastructure complete, live acceptance not complete

Merged in PR #456 on Knowledge main `a8d495ca75fbf6489df9d75b818b6d9aa0e967ae`.

The harness composes the existing production-shaped Knowledge services:

1. K-CASE-003 Candidate intake;
2. K-CASE-004 trusted resolver and immutable evidence collection;
3. K-CASE-006 deterministic Dossier assembly;
4. K-CASE-007 human privacy review/finalization.

It adds a durable acceptance receipt/event ledger with explicit `TEST` / `LIVE` and `DEFAULT_HTTP` / `INJECTED_TEST` boundaries. TEST runs can never become eligible for K-CASE-008 review. LIVE mode forbids injected test transport. A finalized LIVE receipt is only eligible for operator K-CASE-008 review when it also contains a real producer promotion reference. Eligibility is not itself the acceptance decision.

MarkReg outage is represented as retryable `WAITING_SOURCE`; privacy rejection is terminal and produces no finalized/eligible evidence. The harness and privacy workflow share one deterministic clock source to avoid cross-service timestamp regression while preserving default production system time when no clock is injected.

Repository fixtures, synthetic MarkReg responses and unit tests remain non-acceptance evidence.

## 3. Current blocker — K-CASE-002

K-CASE-002 remains the first unfinished Case dependency.

Repository/system: `yoomarks/markorbit` / `services/markreg` plus the appropriate UI/Gateway surface.

Required operator action remains conceptually:

> Send to Knowledge Case

The producer side must:

- create or reuse a valid `CaseCandidateV1` from one real Formal Matter without manual duplicate entry;
- preserve the actual Formal Matter workspace/version/snapshot lineage;
- expose a legitimate server-side trusted resolver path for MarkReg URL + Workspace + internal authorization + Workspace Principal;
- provide an opaque producer promotion reference that can be frozen into the Knowledge live-acceptance receipt;
- preserve idempotency so repeated operator action does not create duplicate Case Candidates;
- avoid implying publication or Brain-style conclusions.

A fresh read-only audit of MarkOrbit main `4473e4be2ba432332d546c04b44397cb3bba3137` found no `Send to Knowledge`, `CaseCandidateV1` producer binding, Case promotion implementation or corresponding PR. K-CASE-002 therefore remains blocked by cross-repository implementation, not by missing Knowledge infrastructure.

The current Knowledge takeover authorization does not include writing `yoomarks/markorbit`; do not invent a Knowledge-owned substitute.

## 4. K-CASE-008 live acceptance gate

K-CASE-008 is **not complete** until one completed real MarkReg matter passes the real producer path and produces durable evidence.

The live acceptance must prove:

1. an operator selects one real completed MarkReg matter once through K-CASE-002;
2. the producer creates/reuses the real Candidate and returns a producer promotion reference;
3. Knowledge uses the real trusted resolver with production-shaped authorization rather than injected test transport;
4. the same source matter/version/snapshot identity is preserved into immutable evidence;
5. a deterministic Dossier is assembled from that evidence;
6. human privacy review reaches `FINALIZED` or the run correctly stops as rejected;
7. the finalized Dossier is retrievable;
8. the live acceptance receipt is `LIVE` + `DEFAULT_HTTP`, carries the producer promotion reference and is eligible for operator review;
9. replay does not duplicate Candidate, collection, Dossier or acceptance evidence;
10. no Brain-style lesson, recommendation, success probability or legal-truth certification is generated.

The preferred first real matter should be selected for evidence completeness and operational safety, not because a fixture exists for that matter type.

## 5. Current execution order

### P0-1 — implement K-CASE-002 in MarkOrbit

This is the highest-value blocker. No more Knowledge-side Case architecture should be added merely to work around its absence.

### P0-2 — run K-CASE-008 with one completed real matter

Only after K-CASE-002 and a legitimate trusted resolver are available. Reuse the merged #456 harness; do not build another acceptance path.

### P0-3 — K-EXP-004 first live Expert vertical slice

Still blocked on Shared Communication send identity plus inbound reply/thread correlation.

## 6. Do not start yet

Do not start K-CASE-009 refresh/versioning or K-CASE-010 matter-type expansion merely because the contracts can be imagined. First prove the real K-CASE-008 vertical slice. Real dossier behavior should determine the next abstraction.

Continue to defer:

- direct MarkReg database reads;
- manual Case reconstruction;
- invented MarkReg promotion/resolver endpoints or credentials;
- correspondence capture without a proven source;
- payment-service ingestion without frozen owner/auth/evidence semantics;
- universal Case ontology;
- public release without explicit access review;
- Case lessons/recommendations/predictions/legal-truth certification.

## 7. Operational gates

- issue #405 remains paid/live ADK acceptance and should not be executed merely to advance this Case roadmap;
- issue #429 remains materially unresolved;
- Knowledge main verified at this checkpoint is unprotected;
- MarkOrbit main verified at this checkpoint is also unprotected;
- repository implementation is not evidence that production secrets, routes, credentials or external services are live.
