# MarkOrbit Knowledge Current State

Date: 2026-09-01  
Reviewed Knowledge baseline: `f2feb27de36d10b3b462238eeeccbff9eb349333`  
Reviewed Core baseline: `0ff0d806fbb632584f2aefba41134a771ba02b6e`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architectural freeze remains valid. Do not reopen the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone.

Knowledge still owns acquisition, immutable evidence, provenance, objective change facts, conversion/staging and downstream delivery preparation. Core/Brain still owns semantic interpretation, entity/relationship meaning, legal/business conclusions, value scoring, capabilities, recommendations and Next Best Action.

The 2026-09-01 takeover work did not discover a missing Knowledge framework. It closed cross-repository acceptance-maintenance debt, reran real current-Core acceptance, and narrowed the remaining work to external/live evidence and repository-administration decisions.

## 2026-09-01 completed work

### Core-coupled acceptance maintenance

Three maintenance steps first restored exact audited Core acceptance before changing freshness semantics:

- #639 / PR #640 refreshed Managed AI and MarkReg audited Core pins after an exact incremental Core audit. Squash merge: `9a558730831783b252e3d2040d5d5cb7ae940cdd`.
- #641 / PR #642 refreshed K-CASE-008 after auditing the real MarkReg producer closure. The full PostgreSQL-backed cross-repository acceptance was rerun against the then-current Core boundary. Squash merge: `95033e3e947c3ce255cba6d2e51f7abd4bb6c1d0`.
- #643 and #645 were then closed by PR #644, which replaced coarse whole-monorepo SHA equality with conservative dependency-path-aware freshness classification. Squash merge/current Knowledge baseline: `f2feb27de36d10b3b462238eeeccbff9eb349333`.

### Dependency-path-aware Core freshness

The four Core-coupled Knowledge acceptance workflows now share `scripts/core-drift-gate.mjs` and named dependency profiles:

- `core-intake`;
- `managed-ai`;
- `markreg-contract`;
- `k-case-008`.

The classifier has four states:

- `NO_DRIFT`: current Core main equals the audited baseline;
- `IRRELEVANT_DRIFT`: the complete baseline-to-current path diff is proven to remain inside an explicitly audited isolated surface;
- `RELEVANT_DRIFT`: at least one changed path may affect the tested boundary;
- `UNKNOWN_DRIFT`: ancestry or complete comparison cannot be proven safely.

`RELEVANT_DRIFT` and `UNKNOWN_DRIFT` fail closed. `IRRELEVANT_DRIFT` does not waive acceptance: the workflow still checks out and tests the resolved current Core main. Scheduled workflows never mutate their audited baselines automatically.

The shared default remains conservative. Shared contracts, persistence, migrations, lockfiles, workspace/build configuration and unlisted paths are relevant by default. Profile-specific isolation exists only where the actual build/test closure was reviewed.

See [`CORE_DEPENDENCY_DRIFT_GATES.md`](../operations/CORE_DEPENDENCY_DRIFT_GATES.md) for the operational contract.

### Exact-head cross-repository acceptance

The final PR #644 head `8a4970a48279e7dff7e6f91b02d0c3d0f6e3c230` passed all triggered PR workflows before merge, including:

- real Knowledge -> Core Intake HTTP acceptance with Core PostgreSQL bootstrap and durable content acceptance;
- real Knowledge -> Core Managed AI + Capability V2 localhost HTTP acceptance;
- MarkReg Knowledge Case wire-contract and authoritative Formal Matter invariant acceptance;
- full K-CASE-008 PostgreSQL-backed MarkReg -> Knowledge live service acceptance with fail-closed auth, real promotion, durable replay and one durable completed producer action;
- `autoformat`;
- `validate (22)` through format, lint, typecheck, tests and build;
- `validate (24)` through format, lint, typecheck, tests and build;
- zero unresolved review threads or blocking review submissions.

The final Core main audited immediately before merge was `0ff0d806fbb632584f2aefba41134a771ba02b6e`.

## Active gates

### 1. #573 — CNIPA authenticated trademark judgment acquisition

Phase 1 deterministic contracts, Phase 2 operator-assisted authenticated runtime, Phase 3 manual-only readiness support and visible authenticated UI/business-behavior observations are implemented.

The remaining facts are still blocked on stronger authenticated raw/source-response evidence:

- raw list -> detail source identifiers and the provisional identity rule;
- page 11 / >100 behavior; the observed query did not exceed 100 results, so page 11 remains `NOT_TESTED`;
- backend date-window cap, partitionability and coverage implications; the visible UI's 30-day selector limit is not proof of a backend limit;
- authenticated raw response schema/version freeze.

`CNIPA_JUDGMENT_SCHEMA_STATUS` therefore remains `OPERATOR_SUPPLIED_UNVERIFIED`. Coverage remains `UNKNOWN` or `PARTIAL` as applicable and must not be promoted to `COMPLETE` without evidence.

Do not add CAPTCHA/SSO bypass, stealth/evasion, token export or an anonymous parallel CNIPA service. No additional generic CNIPA framework is justified before a permitted evidence path exists.

### 2. #468 — Expert Shared Communication live slice

Knowledge already owns the Expert task/source contracts, durable replay, fail-closed operator workbench and Core consumer seams. It must not create a second SMTP/Gmail/Graph platform.

Core issue `yoomarks/markorbit#305` remains the external owner of production Shared Communication activation.

A 2026-09-01 audit found a dormant Core branch `feat/305-managed-communication-gmail-runtime` at `449aa38134c3423f45604cadcd50fee75e151844`. The draft contains substantial Core-side work: fail-closed production configuration, Gmail OAuth/send, PostgreSQL account/send/thread/exact-evidence wiring, durable provider-thread resolution, inbound polling and exact-evidence admission.

That branch is not acceptance evidence. At audit time it had no PR and had diverged from current Core: 52 commits behind and 3 commits ahead, with merge base `66900f176d27020e2d7560f9750fa2abfb7f8ca1`.

Before Knowledge can run K-EXP-004, Core still must reconstruct/rebase that work on current main, pass exact-head durability/reconciliation acceptance, and prove one real authorized provider/account send -> reply -> immutable exact evidence path. Knowledge can then run the cross-repository Expert task -> Core send -> real reply -> `ExpertSourceRecordV1` import acceptance with duplicate-safe replay.

### 3. #429 — repository and ADK live governance

Repository baseline protection is active through ruleset `Protect main` / id `21618188`:

- pull request required;
- deletion blocked;
- non-fast-forward/force-push blocked;
- review-thread resolution required;
- strict required checks `autoformat`, `validate (22)`, `validate (24)`;
- no bypass actors.

One independent-review policy question remains open in the current ruleset:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`.

`.github/CODEOWNERS` already assigns repository and workflow ownership to `@yoomarks @whalemarks`. Enabling an approving/Code Owner requirement would change the current autonomous merge operating model, so it is an explicit repository-administration decision rather than a silent code change.

The ADK live workflow already uses `environment: adk-live` and exact-main-SHA authorization. The connected engineering API cannot verify protected-environment approval settings or secret values. Successful ADK evidence also still requires authorized non-public durable retention beyond the temporary Actions artifact window.

### 4. #405 — ADK-06 live 3x2 paid-provider acceptance

Repository-controlled runtime and evidence safeguards are implemented, but no live acceptance has occurred.

A 2026-09-01 Actions audit returned zero `workflow_dispatch` runs on `main`. Therefore there is no valid six-cell DeepSeek/OpenAI live execution evidence, regardless of deterministic CI or skipped owner-command workflow activity.

Final acceptance still requires an explicitly authorized run from the exact current main with `confirm_live_provider_calls=true`, the required live secrets, the DeepSeek off-peak gate, all 6 cells `EXECUTED`, 12 unique finalized RawArtifact receipts, no unresolved in-flight delivery, encrypted evidence packaging and authorized non-public durable retention tracked by #429.

Do not spend provider credits or close #405 from fake, skipped, partial or stale-main evidence.

## Current work order

1. Keep #429 at the repository-administration boundary: decide the intended independent approving/Code Owner policy, verify `adk-live` environment governance, and preserve durable evidence retention requirements.
2. Advance #573 only when a permitted authenticated evidence path can prove the remaining raw/source-response facts; do not infer them from UI behavior.
3. Keep #468 blocked on Core #305. When Core lands and live-accepts one provider runtime, run the existing Knowledge consumer slice rather than building a duplicate communication stack.
4. Keep #405 manual and explicitly authorized. Repository code readiness is not live-provider acceptance.
5. Add new Knowledge product/provider breadth only when a concrete, evidence-backed acquisition or staging gap is identified.

## Historical-document rule

Do not rewrite earlier acceptance records to make them describe later work:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`;
- `KNOWLEDGE_CURRENT_STATE_2026-08-29.md`.

This file is the 2026-09-01 current-state checkpoint. Future material changes should create a newer dated checkpoint and leave this evidence intact.
