# MarkOrbit Knowledge — Current Engineering State

Checkpoint date: 2026-08-31

This is the canonical engineering handoff entry point. It records a verified checkpoint, not a permanently current branch pointer. Re-verify GitHub `main`, open PRs/issues, repository rulesets, current Core `main`, and any paid/live gate before protected or external execution.

## Verified baseline

- Repository: `yoomarks/markorbit-knowledge`
- Verified Knowledge `main`: `4968975fd20042f3c6fa65e5808fd0d618ba69e4`
- Latest merged Knowledge PR: #610 — repository-level four-source K-FED integration acceptance
- Latest audited MarkOrbit/Core `main`: `03d6260fdb33fdf697462af34433a9bdfb9cfd8e`
- Open issues at this checkpoint: #405, #429, #468, #573
- There is no separate unblocked internal P0 issue at this checkpoint. Do not invent framework work merely to keep coding.

## Canonical strategic direction

The product direction is Web / AI / Expert / Case, with Knowledge preserving objective information and Brain owning interpretation, evaluation, recommendation and protected decision semantics.

Knowledge owns acquisition, preservation, structure, relationships, update/version lineage, retrieval and evidence provenance. Knowledge does not own source/provider/expert truth ranking, legal-truth certification, prediction, recommendation, strategy or protected decisions.

For Knowledge, an AI answer or Expert reply is acquired source evidence. For Brain, AI may additionally be used as a reasoning tool. Do not collapse those responsibilities.

## Four pillars

### Web

Public web, official sources, documents, APIs, feeds, media and structured public information remain inside Knowledge. Web evidence that reaches verified canonical retrieval retains source identity, source category, authority level, canonical/source URI, RawArtifact lineage and exact chunk identity.

Do not broadly expand Web acquisition merely to create more framework surface. New work should close a concrete source, fidelity, coverage or retrieval gap.

### AI

Generic Managed AI transport/runtime remains a shared MarkOrbit/Core capability boundary. Knowledge retains assignment/source semantics, exact provider evidence, RawArtifact lineage, provenance, recovery and fail-closed acceptance semantics.

Knowledge AI evidence uses the real `ai+markorbit:` URI convention in the ingestion/canonical path. K-FED therefore classifies AI canonical evidence from an objective source URI rather than a synthetic family flag.

ADK-06 implementation remains separate from live acceptance. #405 is still open because the real 3 assignments × 2 providers run requires explicit live-provider credentials/authorization, exact-SHA execution controls and durable non-public retention. Deterministic CI or non-live integration is not #405 acceptance evidence.

### Expert

Knowledge owns Expert task/source contracts, durable persistence, provenance-preserving source retrieval, workspace task binding and the consumer-side communication seam.

#468 remains the authoritative external dependency/acceptance ledger. Do not assume that a generic production Shared Communication send/reply capability is complete merely because Knowledge has consumer contracts or test seams. Completion still requires one legitimate production Expert send, durable send/thread identity, one same-thread inbound reply with immutable raw evidence, and replay/no-duplicate proof through the shared capability owned outside Knowledge.

Do not create a Knowledge-local generic email/provider stack and do not fabricate send/reply evidence.

### Case

The former MarkReg producer dependency is no longer the primary Case blocker. K-CASE-008 is accepted as a MarkReg promotion → Knowledge intake/collection → live receipt lineage objective, not as a requirement for Knowledge to recreate Core/MarkReg matter state.

PR #603 refreshed the audited Core pin for the K-CASE cross-repository acceptance at that checkpoint. Do not chase every later Core commit merely to move the pin; refresh only when a real compatibility/drift check requires it.

The permanent boundary stands: MarkReg owns operational matter state; Knowledge consumes authorized immutable evidence. Knowledge must not directly read MarkReg persistence, reconstruct a second matter system, fabricate correspondence/payment evidence, or convert MarkReg recommended actions into Knowledge conclusions.

## Retrieval and K-FED state

The retrieval lane has moved materially beyond the old #546 checkpoint.

Merged state includes:

- KG-006 — Related / Backlinks reader surface;
- KG-007 — bounded 1-hop/2-hop local Knowledge Graph View;
- KG-008 — hybrid Knowledge search with graph navigation;
- KG-009 — provider-neutral Knowledge Relationship API;
- KG-010 — explicit LEXICAL / GRAPH / VECTOR retrieval composition with channel-native provenance and no blended score;
- #544 — exact lexical chunk identity/hash lineage through composed retrieval;
- #546 — deterministic retrieval evaluation harness;
- #604 — versioned representative retrieval regression corpus;
- #605 — deterministic metadata/filter vs lexical vs lexical+relationship variant comparator;
- #607 — real frozen Phase 2 USPTO corpus variant benchmark against exact live-accepted document/chunk identities;
- #608 — K-FED v1 federated read surface for WEB / AI / EXPERT / CASE with native evidence preserved and no cross-family blended score;
- #610 — repository-level K-FED acceptance using real SQLite retrieval, Expert, workspace-binding and Case repositories with two-workspace isolation.

The real Phase 2 benchmark currently has no trustworthy live graph-edge evidence. Relationship contribution/noise therefore remains null where no graph evidence exists. Do not invent CITES/DERIVED_FROM or same-source edges merely to make graph lift non-zero.

The durable relationship repository/read-model infrastructure exists, but a production content-to-ContentEdge sourcing rule must be grounded in objective evidence semantics before automatic graph projection is expanded.

## Evidence retention security

PR #606 hardened retained USPTO live evidence by sanitizing runner-local worker credential fields before artifact upload. Retained bootstrap evidence now keeps the field null/redacted rather than preserving an ephemeral control-plane credential.

Never publish or reconstruct historical runner-local credential values from old artifacts.

## Repository governance (#429)

Repository ruleset `Protect main` is active for the default branch. At this checkpoint it:

- blocks branch deletion;
- blocks non-fast-forward updates;
- requires pull-request based changes;
- requires review-thread resolution;
- requires strict status checks `autoformat`, `validate (22)` and `validate (24)`;
- has no bypass actors and reports the current user cannot bypass it.

However, the current ruleset also reports:

- `required_approving_review_count: 0`;
- `require_code_owner_review: false`.

Therefore #429 remains a real repository-administration blocker. Do not describe Code Owner enforcement as complete until the live ruleset actually requires it. Durable non-public retention for successful #405 evidence also remains part of governance closeout.

## Active external / operator gates

### #405 — ADK-06 live 3×2 provider acceptance

Keep blocked until explicit paid/live authorization, required provider credentials, exact current main SHA, protected execution controls, evidence passphrase and durable non-public archive destination are genuinely ready.

### #429 — repository governance closeout

Requires actual GitHub administration changes/evidence, especially Code Owner approval enforcement, plus durable archive closeout for successful #405 evidence. Documentation cannot substitute for repository settings.

### #468 — real Expert send/reply vertical slice

Requires a verified production Shared Communication path owned outside Knowledge and one real send → same-thread reply → immutable source evidence acceptance. No fake sender/reply or Knowledge-local provider platform counts.

### #573 — CNIPA authenticated live validation

Deterministic architecture and operator-assisted runtime are implemented. Remaining acceptance needs a legitimate human-authorized login/CAPTCHA session and real authenticated probes for registration-number, party-role, source-identity and >100/coverage behavior. Never bypass CAPTCHA, SSO, access controls or rate limits.

## Current engineering order

1. Do not create another retrieval framework after #604/#605/#607/#608/#610. Add retrieval work only when a measured corpus, source or production behavior exposes a real gap.
2. Keep #429 as a manual/admin gate until Code Owner enforcement is actually enabled and verified.
3. Re-audit the exact current Core/Shared Communication boundary before any #468 production Expert attempt; do not rely on stale assumptions.
4. Keep #573 operator-assisted and fail closed until an authorized CNIPA session is available.
5. Keep #405 blocked until explicit live-provider authorization and durable evidence retention are ready.
6. Advance Case, graph or Web work only when objective production evidence shows a specific interoperability, lineage, coverage or retrieval defect.

## Stop / defer

- another generic retrieval framework;
- blended cross-channel truth/relevance scores;
- synthetic vector/provider metrics;
- fabricated graph edges or graph lift;
- Knowledge-local generic AI transports;
- Knowledge-local generic mailbox/provider stack;
- fake live Expert send/reply evidence;
- direct MarkReg database reads or manual matter reconstruction;
- speculative universal Case ontology;
- broad Web extraction expansion without a concrete production need;
- autonomous CNIPA CAPTCHA/SSO bypass;
- paid/live #405 execution merely to advance roadmap optics.

## Engineering operating rule

**抓大放小.** Prefer durable end-to-end information assets, exact lineage, real source flows and measurable retrieval quality over micro-frameworks and speculative abstraction.
