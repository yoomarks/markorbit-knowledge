# MarkOrbit Knowledge Current State

Date: 2026-08-29  
Reviewed Knowledge baseline: `929fbe783d345b0364e90f64f7c58013c80f7103`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architectural freeze remains valid. Do not reopen the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone.

Knowledge owns acquisition, immutable evidence, provenance, objective change facts, conversion/staging and downstream delivery preparation. Core/Brain owns semantic interpretation, entities/relationships, legal/business meaning, value scoring, capabilities, recommendations and Next Best Action.

Current work is narrow: production/live acceptance, repository governance, and external Core/provider dependencies. It is not a request for another ingestion, scheduling, communication, semantic-scoring or execution framework.

## Verified after the 2026-08-23 closeout

### Core intake boundary

Knowledge -> Core intake has a real cross-repository acceptance gate. The accepted run checked out the audited Core receiver, bootstrapped real Core PostgreSQL, started the authenticated receiver, submitted the frozen Knowledge ReadyPackage/content through the production HTTP path, obtained durable Core `ACCEPTED`, and asserted the persisted staging Markdown against the submitted content.

The accepted Core pin for that run remains `b6013d79697e6873f5941bb7e17058b124b5c643`. Core can advance independently; rerun the freshness/E2E gate when an intake-boundary path changes rather than refreshing this historical acceptance pin for unrelated Core commits.

### Acquisition/runtime posture

Post-freeze acquisition includes:

- production Crawl4AI web acquisition;
- bounded Tavily structural source discovery;
- Bright Data Web Unlocker as disabled-by-default fallback for eligible Crawl4AI failures;
- immutable RawArtifact/CAS evidence and provenance;
- durable Worker Protocol / Execution Ledger scheduling and collection;
- removal of obsolete Knowledge-local semantic scoring and in-memory worker/scheduler scaffolds.

Ordinary CI performs no paid-provider calls.

### CNIPA authenticated acquisition readiness — #573

Deterministic Phase 1 contracts, Phase 2 operator-assisted Playwright runtime, and the manual-only Phase 3 acceptance harness are implemented.

The safety boundary remains strict: no CAPTCHA solving/bypass, no OTP bypass, no token forging, no stealth/proxy-rotation behavior, and no repository-stored authenticated session material. Cookies/Bearer/session state stay inside the operator-managed authenticated execution boundary; exact sanitized evidence flows through the existing immutable RawArtifact protocol.

Production acceptance still requires one authorized human login/CAPTCHA session and real evidence for the target registration across all three libraries, party/role mapping, list/detail identity semantics, pagination/coverage behavior and schema promotion. Unsupported facts remain `UNKNOWN`/`PARTIAL` until observed.

### Public trademark-search source boundaries — resolved #590

The 2026-08-29 source audit established that CNIPA's real trademark online-search service is behind unified identity registration/sign-in and must not be modeled as an anonymous structured JSON/API source.

The corrected model is now merged to `main` via PR #593 (`929fbe783d345b0364e90f64f7c58013c80f7103`), superseding draft PRs #589 and #591:

- India: anonymous official guidance is the governed WEB target; protected search entrypoints retain their account/OTP or CAPTCHA/OTP boundary.
- New Zealand: the official guidance page is the anonymous governed target; Trade Mark Check / Case Search remain separate interactive entrypoints.
- China: the representative anonymous `SEARCH` target is an official CNIPA guidance surface with `WEB_CRAWL` + `HTML`/`MARKDOWN`; the actual online-search service is recorded as login-protected, with no invented anonymous JSON claim.
- Representative Source Live Canary path filters now include source-catalog inputs that can change the selected live target.
- The WEB canary runner fails fast if a future selected target requires artifact kinds outside its real Crawl4AI HTML/Markdown capability.

Exact source head `203c08a6de863607fbae35d0e631e360c894f47f` passed Node 22/24 Validate through Python compile/tests, format, lint, typecheck, full workspace tests and build. A real main-targeted Representative Source Live Canary then proved the corrected CN target twice at the same exact source head: 3.370s and 3.382s, one page each, two `HTML`/`MARKDOWN` artifacts, zero missing expected kinds, 14,698 bytes. Evidence artifacts: `9716207455` (`sha256:9e0565813c85e63bb708cf27a813bdc35416c0d8cc74c360c1e94b7ebe5f7d1d`) and `9716291879` (`sha256:262e505032dc76fc646939f6ff9340c3814c70a2a02a88e3b60038536562d94d`).

PR #593 then reran the required main-targeted `validate (22)`, `validate (24)` and autoformat gates successfully before merge. Issue #590 is closed as completed. Do not reopen anonymous CNIPA JSON/API acquisition without new official evidence of a stable anonymous structured endpoint.

## Active gates

### 1. #429 — repository governance

Active ruleset `Protect main` currently enforces PR-only changes, deletion/non-fast-forward protection, review-thread resolution, strict required checks `autoformat`, `validate (22)`, `validate (24)`, and no bypass actors.

The remaining governance regression is:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`.

`.github/CODEOWNERS` already assigns repository/workflow ownership to `@yoomarks @whalemarks`. Restore at least one approving review plus Code Owner review without weakening exact-head checks, thread resolution or no-bypass policy.

Protected `adk-live` Environment administration remains an owner/admin verification boundary because the connected engineering API cannot verify Environment reviewers or secret scope.

### 2. #573 — CNIPA authenticated live validation

No additional generic CNIPA framework is justified before authenticated evidence exists. The next valid step is an authorized human login/CAPTCHA session followed by the bounded Phase 3 probe. Do not infer unsupported query, identity, pagination or completeness behavior.

### 3. #468 — Expert Shared Communication live slice

Knowledge already contains the outbound/inbound Core consumer seams. The remaining blocker is Core-owned `yoomarks/markorbit#305`.

A 2026-08-29 audit of Core main `bde37b56c3ddba8afc3b127a2d06e1b4b553d37e` found no production Managed Communication bootstrap/provider sender wiring in `services/capability-engine/src/main.ts`, and Core #305 remains open without a verified production provider implementation.

Do not add a Knowledge-local SMTP/Gmail/Graph transport. Resume the Knowledge live slice only after Core provides the production runtime plus one real provider/account, then prove exactly-once send -> durable receipt/thread -> inbound reply -> immutable Core exact evidence -> Knowledge `ExpertSourceRecordV1` import -> replay without duplicate send/import.

### 4. #405 — ADK-06 paid-provider acceptance

Repository-controlled readiness is complete enough for the frozen 3x2 DeepSeek/OpenAI pilot, but deterministic/fake CI is not final acceptance.

Final acceptance still requires explicit authorization for a real provider run, the frozen plan, exact-current-main gate, DeepSeek off-peak policy, 6/6 executed cells, 12 unique finalized RawArtifact receipts, encrypted evidence packaging and authorized non-public durable retention.

Do not spend provider credits or close #405 from fake, skipped, partial or stale-main evidence.

## Current work order

1. Restore and verify #429 independent review enforcement at repository-admin level.
2. Execute #573 Phase 3 only with an authorized human CNIPA session and freeze only evidence-backed schema/coverage facts.
3. Keep #468 on the existing Knowledge consumer boundary while Core #305 owns production Managed Communication runtime/provider activation.
4. Keep #405 manual and explicitly authorized; no automatic paid execution.
5. Continue source/product breadth only when a concrete evidence-backed gap exists.

## Historical-document rule

Do not rewrite earlier acceptance records to pretend they described later work:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`.

Use this file as the 2026-08-29 takeover baseline. Future phase closeouts should add a newer dated current-state document and update issue state rather than silently mutating historical acceptance evidence.
