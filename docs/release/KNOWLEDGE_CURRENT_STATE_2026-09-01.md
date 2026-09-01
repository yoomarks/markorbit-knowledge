# MarkOrbit Knowledge Current State

Date: 2026-09-01  
Reviewed Knowledge baseline: `0e1068d3de9c32151dac0a7acd64d7ca13536056`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architectural freeze remains valid. Do not reopen or duplicate the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone.

Knowledge continues to own acquisition, immutable evidence, provenance, objective change facts, normalization/conversion, retrieval, source intelligence, and downstream delivery preparation. Core/Brain continues to own semantic interpretation, entities/relationships, legal/business meaning, capability governance, scoring, recommendations, and Next Best Action.

The repository is not missing another generic ingestion, communication, scoring, scheduler, or execution framework. Current work is narrow and evidence-gated: repository governance, authenticated CNIPA source verification, Shared Communication production/live acceptance, and the explicitly authorized ADK paid-provider acceptance.

## 2026-09-01 cross-repository acceptance hardening

### Audited pin refreshes — PR #640 and PR #642

PR #640 merged as `9a558730831783b252e3d2040d5d5cb7ae940cdd`. It refreshed the then-exact audited Core refs used by Managed AI / Capability V2 HTTP acceptance and MarkReg contract drift checks, without weakening the fail-closed freshness guard.

PR #642 merged as `95033e3e947c3ce255cba6d2e51f7abd4bb6c1d0`. It refreshed the K-CASE-008 Core producer pin only after checking the actual MarkReg producer boundary and reran the full PostgreSQL-backed cross-repository acceptance.

Those pin-only changes exposed a monorepo-level maintenance problem: exact whole-Core-main equality made Knowledge acceptance stale whenever unrelated Core lanes merged, even when no consumed boundary changed.

### Dependency-path-aware Core freshness — PR #644

PR #644 merged as `f2feb27de36d10b3b462238eeeccbff9eb349333` and replaced whole-monorepo SHA equality with a conservative dependency-aware freshness classifier shared by four real acceptance workflows:

1. `core-intake`;
2. `managed-ai`;
3. `markreg-contract`;
4. `k-case-008`.

The classifier states are:

- `NO_DRIFT`;
- `IRRELEVANT_DRIFT`;
- `RELEVANT_DRIFT`;
- `UNKNOWN_DRIFT`.

`RELEVANT_DRIFT` and `UNKNOWN_DRIFT` fail closed. `IRRELEVANT_DRIFT` is allowed only for explicitly audited isolated paths. Passing classification never substitutes for the downstream real acceptance: the workflow checks out the classified current Core ref and runs the actual HTTP/PostgreSQL/contract acceptance against it.

Shared contracts, persistence, migrations, lockfiles, workspace/package-manager/build configuration, and every unlisted path remain relevant by default.

### Shared-contract audit and narrow UI/test isolation — PR #650

PR #650 merged as `0e1068d3de9c32151dac0a7acd64d7ca13536056`, closing #648 and #649.

All four audited Core baselines are now intentionally retained at:

`bb26e9c5abc73d05e886001df3b2a8e53606e63f`

That baseline was advanced only after explicit review of the intervening shared-contract change. The classifier then gained two narrow evidence-backed exemptions:

- `apps/markreg-web/**` as a presentation/UI surface outside all four Knowledge acceptance closures;
- exact path `tests/e2e/order-journey-real-runtime.spec.ts` after direct review showed the only change was a rendered heading assertion.

The exact-path rule is implemented as exact equality rather than a prefix match; similarly prefixed files remain relevant. `tests/e2e/**` is not generally exempt.

At final PR head `ae93b381d0dbd4ba9694daaf8ae5d88cfb5f92d6`, the freshness logs classified the audited drift from baseline to Core `4cf727456ed0d5e128419e241c13bfdc2d02802f` as `IRRELEVANT_DRIFT`, and all four substantive acceptances ran against that current Core SHA:

- Core Intake: real authenticated Knowledge -> Core HTTP intake plus PostgreSQL persistence acceptance;
- Managed AI: real Knowledge -> Core Managed AI / Capability V2 localhost HTTP acceptance;
- MarkReg Contract: Formal Matter / Knowledge Case contract and invariant audit;
- K-CASE-008: real MarkReg producer + Knowledge Admin + PostgreSQL acceptance including auth isolation, promotion, replay and durable completed producer action.

Required `autoformat`, `validate (22)`, and `validate (24)` were also green at the same exact Knowledge PR head, with zero unresolved review threads or blocking reviews.

After that acceptance completed, Core main advanced to `b8d3284fd3ae633b628b55744d0c00e746fb3f5c` through MGSN-only work. That later SHA was not part of the #650 substantive acceptance run and must not be described as such. The new classifier is specifically designed so later proven-isolated lane drift can be classified without mutating the audited baseline while still requiring a real acceptance whenever the workflow is next triggered.

## Active gates

### 1. #429 — repository governance

Active ruleset `Protect main` (ID `21618188`) currently targets the default branch with active enforcement, no bypass actors, deletion protection, non-fast-forward protection, PR-required changes, review-thread resolution, and strict required checks:

- `autoformat`;
- `validate (22)`;
- `validate (24)`.

The independent-review gap remains exact and unresolved:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`.

Do not mark #429 complete merely because PR-only and CI protection are active. The protected ADK live Environment / secret scope and authorized non-public durable evidence retention also remain repository-owner/admin verification boundaries.

### 2. #573 — CNIPA authenticated trademark judgment acquisition

Phase 1 deterministic contracts, Phase 2 operator-assisted authenticated runtime, the manual Phase 3 readiness harness, transport corrections, offline response assessment support, and manual authenticated UI observation support are merged.

The strongest current evidence is authenticated visible UI/business behavior plus sanitized transport facts. On 2026-09-01 the authorized operator confirmed, without exposing real query values, matching visible registration-number results across all three judgment libraries, visible row -> detail correspondence, party-name matching with visible role labels, and the ordinary UI blocking a date span over 30 days.

Those observations do not verify raw HTTP response schema, raw list -> detail source identifiers, source field semantics, backend-only pagination/date caps, partitionability, exhaustive coverage, or an application-controlled authenticated source-response path.

Therefore:

- `CNIPA_JUDGMENT_SCHEMA_STATUS` remains `OPERATOR_SUPPLIED_UNVERIFIED`;
- page 11 / >100 remains `NOT_TESTED` because the observed result set did not exceed 100;
- the visible 30-day selector limit is not evidence of the backend cap;
- coverage must remain `UNKNOWN` or `PARTIAL` as applicable;
- no stealth, CAPTCHA bypass, token export/forging, proxy/fingerprint evasion, or other access-control circumvention is authorized.

No additional generic CNIPA framework is justified until stronger permitted authenticated raw/source-response evidence exists.

### 3. #468 — Expert Shared Communication live slice

Knowledge already owns the consumer seams and must not create a second mailbox platform:

- outbound Expert sends call Core `/internal/v1/managed-communication/sends` with stable task idempotency and persist durable send/thread receipt identity;
- inbound reply import reads Core `/internal/v1/managed-communication/thread-resolutions` and fails closed unless the reply carries immutable Core exact-evidence identity, SHA-256 and matching provider provenance;
- Knowledge persists the resulting `ExpertSourceRecordV1` without storing provider credentials.

Core issue `yoomarks/markorbit#305` remains the external production/live owner.

Core PR #482, `Core: wire durable Managed Communication production bootstrap`, is a meaningful provider-neutral bootstrap step. It wires PostgreSQL account/foundation/send-claim/thread/exact-evidence stores into Capability Engine production startup, adds authenticated inbound observation + exact raw evidence ingestion, and intentionally does not expose outbound `/sends` unless an explicit real `ManagedCommunicationProviderSenderV1` is injected and dispatch is separately authorized.

During this checkpoint audit, the latest observed #482 head was `0f6070a2030cc82b7e2bb05482b5149f863817e7`. That head still had not passed the prerequisite formatting/persistence gate: `pnpm format:check` reported `services/capability-engine/src/index.ts`, so the downstream typed build, lint/typecheck, in-memory Communication conformance and PostgreSQL Communication restart acceptance were skipped. #482 therefore is not yet accepted by Knowledge and is not evidence that #305 is complete.

A separate old branch named `feat/305-managed-communication-gmail-runtime` is not a real provider unlock: its latest audited commit `449aa38134c3423f45604cadcd50fee75e151844` changes only `services/capability-engine/src/main.ts` by 22 added lines and contains no Gmail provider sender or credential adapter. Do not treat the branch name as provider evidence.

Once #482 itself passes exact-head Core acceptance and merges, the next legitimate Knowledge-owned step is a cross-repository provider-neutral production-bootstrap acceptance proving Core durable inbound/thread/exact-evidence behavior reaches the existing Knowledge Expert importer. Final #468 closure still requires the #305 real-provider vertical slice: exactly-once Knowledge Expert send -> real provider receipt/thread -> actual reply -> immutable Core exact evidence -> Knowledge `ExpertSourceRecordV1` import -> replay without duplicate send/import.

### 4. #405 — ADK-06 real paid-provider acceptance

Repository implementation remains ready for the frozen 3 assignments x 2 providers DeepSeek/OpenAI pilot, but deterministic/fake CI is not final evidence.

Final acceptance still requires explicit owner authorization, exact-current-main dispatch, real provider credentials, permitted DeepSeek timing, all six cells executed, twelve unique finalized RawArtifact receipts, encrypted evidence packaging, and authorized non-public durable retention outside temporary GitHub Actions artifact retention.

Do not spend provider credits automatically and do not close #405 from fake, skipped, partial, stale-main, or non-retained evidence.

## Current work order

1. Keep the v0.1 Knowledge backbone frozen; do not create replacement frameworks to manufacture activity.
2. Track Core #482 to exact-head green and merge. Only then add the Knowledge-owned provider-neutral production-bootstrap cross-repo acceptance; keep real provider/live closure on Core #305.
3. Advance #573 only from new permitted authenticated source-response evidence; preserve `UNKNOWN`/`PARTIAL` when evidence is insufficient.
4. Close #429 only after independent review enforcement and the remaining protected live-secret/evidence-retention administration are verified.
5. Run #405 only through its explicit paid-provider owner authorization path.
6. Continue source/product breadth only when a concrete evidence-backed gap exists.

## Historical-document rule

Do not rewrite earlier acceptance records to make them appear to describe later work:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`;
- `KNOWLEDGE_CURRENT_STATE_2026-08-29.md`.

This file is the 2026-09-01 current-state checkpoint. Future phase closeouts should add a newer dated checkpoint and update issue state rather than silently mutating historical acceptance evidence.
