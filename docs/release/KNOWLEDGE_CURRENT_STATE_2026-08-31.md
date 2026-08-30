# MarkOrbit Knowledge Current State

Date: 2026-08-31  
Reviewed Knowledge main: `58359d1469c826934b113c61cae9c3b4f25de883`  
Audited Core main: `29942207f42c735dcdad97d451d0c5a22e498872`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architectural freeze remains valid.

Do not reopen the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone without new evidence that the frozen boundary is insufficient.

Knowledge owns acquisition, immutable evidence, provenance, objective change facts, conversion/staging, retrieval, source intelligence and downstream delivery preparation. Core/Brain owns semantic interpretation, entities/relationships, legal/business meaning, value scoring, capabilities, recommendations and Next Best Action.

Current work remains narrow: cross-repository acceptance freshness, repository governance, authenticated live-source acceptance and explicitly authorized provider/live execution. Do not create another ingestion, scheduler, communication, semantic-scoring or execution framework merely to generate work.

## 2026-08-31 takeover closeout

### Core acceptance drift repaired — PR #595

Scheduled cross-repository gates correctly failed closed after Core advanced while Knowledge still held older audited pins.

PR #595 refreshed only three audited `CORE_REF` values to Core main `29942207f42c735dcdad97d451d0c5a22e498872`:

- `MarkReg Core Contract Drift`;
- `K-CASE-008 Cross-Repo Live Acceptance`;
- `Managed AI Core HTTP E2E`.

Before the refresh, current Core `FormalMatter` contracts and `services/markreg/src/formal-matter.ts` were re-audited read-only for the existing Knowledge Case invariants.

Final PR head `946e16569fa607ce79321dcce14e57a77bfbb4d2` passed:

- `Admin V2 Business Surface Autoformat`;
- `validate (22)` and `validate (24)` through Python compile/tests, format, lint, typecheck, full workspace tests and build;
- `MarkReg Core Contract Drift`, including authoritative Formal Matter invariant assertions;
- `Managed AI Core HTTP E2E`, building current Core Capability Engine and proving real localhost Knowledge -> Core Managed AI + Capability V2 acceptance;
- `K-CASE-008 Cross-Repo Live Acceptance`, including PostgreSQL-backed MarkReg -> Knowledge promotion, fail-closed auth/workspace isolation, idempotent replay and one durable completed producer action.

PR #595 was squash-merged as `58359d1469c826934b113c61cae9c3b4f25de883`.

No Knowledge domain contract, paid-provider execution, CNIPA live execution or Core code was changed by this repair.

## Active gates

### 1. #429 — repository governance

Active ruleset `Protect main` (id `21618188`) currently enforces:

- default-branch targeting;
- deletion and non-fast-forward protection;
- pull-request-only changes;
- review-thread resolution;
- strict required checks `autoformat`, `validate (22)`, `validate (24)`;
- no bypass actors (`current_user_can_bypass=never`).

`.github/CODEOWNERS` covers the repository and `.github/workflows/**` with `@yoomarks @whalemarks`.

The remaining independently verified governance gap is still real:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`;
- no explicit required reviewers.

PR #595 supplied direct evidence: GitHub allowed a fully validated workflow-only maintenance PR to merge with zero approving reviews. This does not weaken the acceptance evidence for #595, but it proves that independent review is not repository-enforced.

The code-level paid-provider boundary is already wired to `environment: adk-live` with minimal workflow permissions. Remaining #429 admin acceptance therefore requires:

1. at least one enforced approving review plus Code Owner review, or an equivalent enforced reviewer policy that actually covers workflow changes;
2. independent verification/configuration of protected `adk-live` Environment reviewers and secret scope if supported by the repository plan;
3. an authorized non-public durable archive location for successful encrypted ADK-06 evidence.

Do not close #429 from CODEOWNERS presence or CI success alone.

### 2. #573 — CNIPA authenticated live validation

Phase 1 contracts, Phase 2 operator-assisted Playwright runtime and the manual-only Phase 3 harness remain implemented.

Real operator entry points remain:

- `pnpm --filter @markorbit/worker cnipa:session:login`;
- `pnpm --filter @markorbit/worker cnipa:acceptance:live`.

No authenticated CNIPA live evidence has been recorded after the 2026-08-29 checkpoint. Still unverified:

- one real registration number across all three document libraries;
- actual list/detail source identity;
- one real party-name request and role mapping;
- page 11 / >100 behavior;
- date-window behavior if observed;
- authenticated 403 semantics;
- resulting schema/coverage promotion.

The next valid step is an authorized human login/CAPTCHA session followed by the bounded Phase 3 probe. Do not infer parameter names, completeness, source identity or coverage before evidence exists.

### 3. #468 — Expert Shared Communication live slice

Knowledge's outbound/inbound consumer seams remain the correct boundary.

Core issue `yoomarks/markorbit#305` remains the production implementation lane. Against exact Core main `29942207f42c735dcdad97d451d0c5a22e498872`, Capability Engine production startup still constructs registry/observation/reflection, Managed AI and governed Capability runtime, but does not construct/inject the Managed Communication production exchange/thread/evidence bindings or a verified real provider sender.

Therefore #468 remains blocked on Core production bootstrap + one real provider/account + real exactly-once send/reply/exact-evidence/replay acceptance.

Do not add Knowledge-local SMTP/Gmail/Graph transport and do not manufacture live communication evidence.

### 4. #405 — ADK-06 paid-provider acceptance

Repository-controlled readiness remains complete enough for the frozen DeepSeek/OpenAI 3x2 pilot:

- canonical three-assignment/two-provider plan;
- exact-main authorization;
- DeepSeek off-peak preflight before provider secrets are exposed;
- owner-only dispatch;
- `environment: adk-live`;
- 6/6 `EXECUTED` and 12 unique finalized RawArtifact acceptance checks;
- encrypted durable/partial evidence and resumable recovery;
- fail-closed uncertainty handling.

No paid provider execution is accepted from deterministic/local E2E evidence. #405 remains OPEN until an explicitly authorized real run succeeds and the encrypted evidence is retained in authorized non-public durable storage.

## Current work order

1. Keep cross-repository freshness gates healthy; audit before changing a Core pin and require real boundary E2E rather than SHA-only updates.
2. Complete #429 at repository-admin level without weakening exact-head checks or the `adk-live` execution boundary.
3. Execute #573 Phase 3 only with an authorized human CNIPA session and freeze only evidence-backed facts.
4. Keep #468 on the existing consumer boundary until Core #305 supplies the real production/provider vertical slice.
5. Keep #405 manual and explicitly authorized; do not spend provider credits automatically.
6. Add source/product breadth only for a concrete evidence-backed gap.

## Historical-document rule

Do not rewrite earlier acceptance records to pretend they described later work.

Historical checkpoints include:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`;
- `KNOWLEDGE_CURRENT_STATE_2026-08-29.md`.

Use this file as the 2026-08-31 takeover checkpoint once merged. Future closeouts should add a newer dated current-state document and update issue state rather than silently mutating historical evidence.
