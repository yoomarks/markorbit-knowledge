# MarkOrbit Knowledge Current State

Date: 2026-08-29  
Reviewed Knowledge baseline: `273d85c4a73d2ad0d23b8d3e20cd3cbdfafe25ae`  
Release line: repository package version `0.1.0`

## Decision

The v0.1 architectural freeze remains valid. The repository has moved materially beyond the 2026-08-23 post-freeze closeout, but the Source -> CollectionPlan -> Run/Job -> Worker -> RawArtifact -> Conversion/Staging -> ReadyPackage backbone should not be reopened.

Current work is no longer a broad architecture build. It is concentrated in production/live acceptance, repository governance, provider activation, and evidence-backed source expansion.

Knowledge continues to own acquisition, immutable evidence, provenance, objective change facts, conversion/staging and downstream delivery preparation. Core/Brain continues to own information understanding, entity/relationship interpretation, legal/business meaning, value scoring, capabilities, recommendations and Next Best Action.

## Verified after the 2026-08-23 closeout

### Core intake boundary

The Knowledge -> Core intake path has a real cross-repository acceptance gate. The latest boundary-scoping PR (#584) passed `core-ref-freshness` and `real-core-intake` on its exact head, including:

- checkout of the audited exact Core receiver SHA;
- real Core PostgreSQL bootstrap;
- startup of the authenticated Core receiver;
- Knowledge -> Core ReadyPackage/content submission through the production HTTP path;
- durable Core `ACCEPTED` state;
- PostgreSQL assertion that the frozen staging Markdown equals the submitted content.

The accepted pin for that run was Core `b6013d79697e6873f5941bb7e17058b124b5c643`. Core has since advanced with unrelated Brain/Capability work; do not represent the workflow pin as equal to the current Core main unless the freshness gate is rerun. Re-run the cross-repository gate when a Knowledge/Core intake-boundary path changes rather than refreshing the pin for unrelated Core commits.

### Web acquisition provider routing

Post-freeze web acquisition now includes the existing Crawl4AI primary path plus bounded optional provider support:

- Tavily structural source discovery;
- Bright Data Web Unlocker as a disabled-by-default fallback for eligible Crawl4AI fetch failures;
- unlocked HTML routed back through Crawl4AI processing so RawArtifact semantics remain unified;
- provider credentials remain runtime-only;
- ordinary CI makes no paid-provider calls.

Tavily discovery has a dedicated bounded runtime command and a manual-only live smoke path. Tavily remains structural discovery, not collection authority, legal truth or semantic relevance scoring.

### CNIPA authenticated acquisition readiness

Issue #573 has completed deterministic Phase 1 contracts, Phase 2 operator-assisted Playwright runtime, and the manual-only Phase 3 live acceptance harness.

Verified implementation boundaries include:

- operator-managed authenticated browser session outside the repository;
- no CAPTCHA solving/bypass, token forging, stealth or proxy-rotation behavior;
- cookies/Bearer/session state remain inside the authenticated execution boundary;
- exact sanitized list/detail response evidence flows through the existing immutable RawArtifact protocol;
- bounded requests/pages/details, pacing and fail-closed reauthentication/access/schema/coverage handling;
- party/date acquisition remains disabled where request parameters are not yet live-verified;
- ordinary CI performs zero CNIPA live requests.

CNIPA is not yet production-accepted. Authenticated live evidence is still required for a real registration number across all three libraries, party-name/role mapping, list/detail identity semantics, page 11 / >100 behavior, coverage classification, and endpoint/schema promotion from operator-supplied unverified observations.

### Runtime simplification

The repository intentionally retired obsolete parallel execution paths after the production path became durable:

- Knowledge-local semantic discovery scoring was removed; semantic topic/relevance/priority inference remains a Core responsibility;
- the legacy in-process worker runner/loop/lease/concurrency/heartbeat scaffold was removed;
- the legacy memory scheduler/dispatcher scaffold was removed;
- production scheduling remains the persistence-backed scheduler and Execution Ledger;
- production collection remains Worker Protocol v1 / controlled worker runtime / ArtifactBackedCollectionExecutor.

These removals reduce duplicate authority rather than remove production behavior.

### Current validation baseline

The latest cleanup PR (#587) passed the exact-head canonical `Validate` workflow on Node 22 and Node 24, including Python worker checks, format, lint, typecheck, tests and build. The cleanup also removed the previously reported unused-symbol lint warnings without changing runtime contracts.

## Active gates

### 1. #429 — repository governance

The default branch is protected by active ruleset `Protect main` and currently enforces:

- pull-request-only changes;
- deletion and non-fast-forward protection;
- review-thread resolution;
- strict required checks `autoformat`, `validate (22)`, and `validate (24)`;
- no bypass actors.

However the current ruleset has regressed to:

- `required_approving_review_count = 0`;
- `require_code_owner_review = false`;
- `require_last_push_approval = false`.

`CODEOWNERS` already assigns both repository-wide and workflow ownership to `@yoomarks @whalemarks`, so an independent Code Owner path exists. The repository-admin remediation is to restore at least one approving review plus Code Owner review without weakening the existing exact-head checks, review-thread resolution or no-bypass policy.

Protected `adk-live` Environment administration remains an owner/admin verification boundary because the connected engineering API cannot read Environment reviewers or secret scope. The durable non-public live-evidence archive requirement also remains tied to a successful #405 execution.

### 2. #573 — CNIPA authenticated live validation

No additional generic CNIPA framework should be added before authenticated evidence exists. The next valid work is an authorized operator login/CAPTCHA session and the bounded Phase 3 live probe. Any unsupported identity, query field, pagination or completeness behavior must remain `UNKNOWN`/`PARTIAL` rather than being inferred.

### 3. #468 — Expert Shared Communication live slice

Knowledge already contains the outbound and inbound Core consumer seams from PR #538 and PR #540. Core #274/#283 provide the provider-neutral send/receipt/thread and immutable exact inbound-evidence contracts.

The remaining blocker is Core-owned issue `yoomarks/markorbit#305`: production Capability Engine bootstrap still does not wire the Managed Communication exchange/thread/exact-evidence bindings and no concrete production `ManagedCommunicationProviderSenderV1` sender is currently verified.

Do not add a Knowledge-local SMTP/Gmail/Graph transport. Resume Knowledge live acceptance only after Core #305 supplies the production runtime plus one real provider/account, then prove exactly-once Expert send -> durable receipt/thread -> real inbound reply -> immutable Core exact evidence -> Knowledge `ExpertSourceRecordV1` import -> replay without duplicate send/import.

### 4. #405 — ADK-06 paid provider acceptance

Repository-controlled readiness is complete enough for the frozen 3x2 DeepSeek/OpenAI pilot, but deterministic CI/fake execution is not final acceptance.

Final acceptance still requires an explicitly authorized real provider run with the frozen plan, exact-current-main gate, DeepSeek off-peak policy, 6/6 executed cells, 12 unique finalized RawArtifact receipts, encrypted evidence packaging, and authorized non-public durable retention.

Do not spend provider credits from ordinary repository-maintenance authority and do not close #405 from fake, skipped, partial, or old-main evidence.

## Current work order

1. Restore and verify #429 independent review enforcement at repository-admin level.
2. Execute #573 authenticated CNIPA Phase 3 only with an authorized human session; freeze verified schema/coverage facts from evidence only.
3. Keep #468 on the existing Knowledge consumer boundary while Core #305 owns production communication runtime/provider activation.
4. Keep #405 manual and explicitly authorized; no automatic paid execution.
5. Continue source/product breadth only when a concrete evidence-backed gap exists; do not create another ingestion, scheduling, communication, semantic-scoring or execution framework.

## Historical-document rule

The following files remain historical baselines and should not be rewritten to pretend they described later work:

- `KNOWLEDGE_V0_1_RELEASE_READINESS_2026-08-12.md`;
- `KNOWLEDGE_POST_FREEZE_PRODUCTION_VALIDATION_CLOSEOUT_2026-08-23.md`.

Use this document for the 2026-08-29 takeover baseline. Future phase closeouts should add a newer dated current-state document and update issue state rather than silently changing historical acceptance evidence.
