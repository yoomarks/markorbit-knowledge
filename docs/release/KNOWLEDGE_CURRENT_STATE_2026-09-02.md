# MarkOrbit Knowledge Current State

Date: 2026-09-02  
Reviewed Knowledge baseline: `fa175f3e9a53c3ea047cb42d1e1bc354588f0340`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architecture remains frozen. Do not replace or duplicate the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone.

Knowledge owns acquisition, immutable source evidence, provenance, objective source/change facts, normalization/staging, retrieval, acquisition intelligence and downstream delivery preparation. Core/Brain owns semantic interpretation, entity/business meaning, capability governance, protected decisions, scoring and recommendations.

The current queue is not another framework build. It is a small set of external/live/operator gates plus dependency maintenance when an actually consumed Core boundary changes.

## Current accepted cross-repository state

Knowledge PR #658 merged as `fa175f3e9a53c3ea047cb42d1e1bc354588f0340`, closing #657.

All five dependency-aware Core acceptance workflows now retain the same audited baseline:

`97ca3d14d0e70c3cb8d41832a50d7ef1f2cfa22e`

The five profiles are:

1. `core-intake`;
2. `managed-ai`;
3. `managed-communication`;
4. `markreg-contract`;
5. `k-case-008`.

The baseline was advanced only after auditing the relevant Core changes, including:

- Core #499 / `7c984f08adb4f32ec71d92cd2b9a1204cfc6bf48`: additive Coverage Gap Phase 7 shared contract under `packages/contracts/**`;
- Core #501 / `e3b9234857f80565fc9691d54d4b9654e105d57e`: deterministic Gmail Managed Communication adapter under Capability Engine;
- Core #504 / `97ca3d14d0e70c3cb8d41832a50d7ef1f2cfa22e`: governed USPTO Method currentness authority;
- intervening MarkReg owner-local changes relevant to the MarkReg/K-CASE consumers.

PR #658 exact head `a6c6932611ce615d2e3a8ad5598143f04106d9d7` passed:

- Core Intake real authenticated HTTP + PostgreSQL acceptance;
- Managed AI + Capability V2 real localhost Core HTTP acceptance;
- Managed Communication real Capability Engine production entrypoint + PostgreSQL migration + exact-evidence import + restart/replay + singular durable-row acceptance;
- MarkReg candidate wire contract and Formal Matter invariants;
- K-CASE-008 real MarkReg producer + Knowledge Admin + PostgreSQL acceptance, including fail-closed auth/workspace isolation, promotion, replay and durable completed producer action;
- `autoformat`;
- `validate (22)`;
- `validate (24)`.

At merge, current Core main was `2ba41d70d01e316fd8648468b84edd4f97212903`. The delta from the retained audited baseline was entirely `apps/lite-web/**`, an already-proven isolated surface. The path-aware classifier therefore correctly allows the workflows to test current Core without mutating the audited baseline for unrelated UI drift.

The classifier remains conservative: shared contracts, Capability/MarkReg consumed services, persistence/migrations, workspace/package-manager/build configuration, lockfiles and unknown paths remain relevant by default. `RELEVANT_DRIFT` and `UNKNOWN_DRIFT` still fail closed.

## Shared Communication / Expert state

Knowledge's provider-neutral production bootstrap acceptance is complete. Knowledge already consumes only the shared Core communication boundary and does not own provider credentials.

Core #501 is now merged. It provides the deterministic Gmail adapter previously missing from Core #305/#487, including bounded OAuth token refresh/cache, deterministic RFC822 send/reply construction, stable provider message/thread/history primitives, inbound history synchronization, exact raw RFC822 evidence, replay-safe identity, self-message filtering, attachment digest handling and credential/session-header redaction. Core #487 is therefore complete.

This does **not** close Knowledge #468 or Core #305. The production entrypoint still does not construct/inject the Gmail sender from live provider credentials, and #501 made no real Google/Gmail call.

Final #468 acceptance still requires an explicitly authorized real-provider vertical slice:

Knowledge Expert task -> Core governed send -> real provider receipt/thread -> actual same-thread reply -> immutable Core exact evidence -> Knowledge `ExpertSourceRecordV1` import -> replay without duplicate send/import.

Do not create a Knowledge-local Gmail/SMTP/Graph stack and do not treat deterministic provider tests as live communication evidence.

## Unrun live/manual acceptance

A repository Actions audit on 2026-09-02 found zero runs whose event was `workflow_dispatch`. This is important only for workflows whose acceptance explicitly requires a manual live dispatch; it does not mean every workflow with a manual trigger is a blocker.

### #571 — Tavily bounded live smoke

PR #572 merged the Tavily runtime/CLI and manual live-smoke workflow, but its own acceptance deliberately deferred the real request until post-merge so PR CI could not consume provider quota. #571 was therefore reopened on 2026-09-02.

Remaining acceptance is exactly one explicitly authorized Tavily request from current `main`, with exact-SHA confirmation, the protected/runtime `TAVILY_API_KEY`, same-host discovery bounds and no retry. Deterministic fake-fetch tests do not satisfy the live-smoke item.

Do not trigger Tavily quota without explicit authorization.

### #405 — ADK-06 real 3 x 2 provider acceptance

The real three-assignment x DeepSeek/OpenAI acceptance has never been dispatched. Deterministic CI is not live evidence.

It remains blocked on explicit paid/live authorization, required provider credentials, exact-current-main execution, permitted DeepSeek timing, evidence passphrase, six successful provider cells, twelve finalized RawArtifact receipts and authorized non-public durable evidence retention.

Do not spend provider credits automatically.

## Other active gates

### #573 — CNIPA authenticated raw/source verification

Phase 1 contracts, Phase 2 operator-assisted runtime, Phase 3 readiness tooling, transport/static-client evidence and manual UI observation are implemented.

The authorized manual UI observations already establish matching visible registration-number results across all three judgment libraries, visible row-to-detail correspondence, party-name/role-label matching and the visible >30-day selector restriction.

Still not verified:

- raw list -> detail source identifiers and the provisional local identity rule;
- page 11 / >100 behavior;
- backend date-window enforcement and partitionability;
- authenticated raw response schema/version;
- exhaustive coverage.

`CNIPA_JUDGMENT_SCHEMA_STATUS` remains `OPERATOR_SUPPLIED_UNVERIFIED`; coverage remains `UNKNOWN` or `PARTIAL` as applicable. Do not bypass CAPTCHA, SSO, access controls or rate limits.

### #429 — repository governance

The active `Protect main` ruleset continues to enforce PR-based changes, deletion/non-fast-forward protection, review-thread resolution and strict `autoformat`, `validate (22)`, `validate (24)` checks with no bypass actors.

The remaining administrative gaps are still real:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`;
- protected live-secret/environment verification;
- authorized non-public durable retention for successful #405 live evidence.

Do not silently enable independent approvals because that is a repository-owner policy decision and can intentionally change autonomous merge behavior.

## Historical release closeout observation

The original v0.1.0 release-candidate PR #109 explicitly required a post-merge Release Candidate rerun on merge SHA `96ff34907c4ece78cb7a247c6b534c2d10031b11` before manually creating tag/release `v0.1.0`.

Audit on 2026-09-02 found only the normal `Validate` run on that merge SHA; no post-merge Release Candidate dispatch, `v0.1.0` tag or GitHub Release was found. This is a historical publication closeout observation, not authorization to publish an old release now. Do not create the tag/release without an explicit current release decision.

## Current work order

1. Keep the architecture frozen and continue only evidence-backed owner-local maintenance.
2. Keep #468 open until Core #305 supplies production provider wiring and an explicitly authorized real Gmail/test-account pilot is possible.
3. Keep #571 open until its one-request Tavily live smoke is explicitly authorized and retained.
4. Advance #573 only from a permitted authenticated raw/source-response path; never infer backend facts from visible UI alone.
5. Close #429 only after the actual repository-administration settings and retention destination are verified.
6. Run #405 only through its explicit owner-authorized live-provider path.
7. Audit Core drift when the frozen classifier reports relevant/unknown changes; do not churn baselines for proven isolated app-only drift.

## Historical-document rule

Do not rewrite prior dated acceptance/current-state records to make them describe later work. In particular, preserve:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`;
- `KNOWLEDGE_CURRENT_STATE_2026-08-29.md`;
- `KNOWLEDGE_CURRENT_STATE_2026-09-01.md`.

This file is the 2026-09-02 checkpoint. Future material state changes should receive a new dated checkpoint rather than silently rewriting historical evidence.
