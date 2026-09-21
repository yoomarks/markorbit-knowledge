# Merge Readiness

A pull request is merge-ready only when all **required deterministic gates** are green and every visible red or pending acceptance check has been classified.

## Required deterministic gates

The protected `main` branch currently requires:

- `autoformat`
- `validate (22)`
- `validate (24)`

`validate (22)` also carries two conditional fail-closed acceptance guards:

1. **Admin browser critical path** — when Admin/operator-browser-critical files change, it installs Chromium and runs the critical Admin journey plus evidence/accessibility/CSRF probes.
2. **K-CASE-008 Core freshness** — when Case/K-CASE boundary files change, it compares the audited Core pin against current Core and fails on relevant or unknown drift.

These conditional guards make the existing required context enforce the relevant acceptance boundary without making unrelated live-provider workflows globally required.

## Non-required live workflows

External/live evidence checks are not blanket merge blockers because they may depend on provider availability, public-site state, or unrelated subsystems. A red live workflow must still be classified before merge:

- **BLOCKING** — failure is relevant to the PR or an audited dependency boundary. Fix/reaccept before merge.
- **UNRELATED** — failure is demonstrably outside the PR's changed/consumed boundary and is already tracked separately.
- **ENVIRONMENTAL** — external availability/runner condition is proven to be the cause; track remediation if persistent.

Do not use GitHub's `mergeable=true` as sufficient evidence.

## Historical examples

- PR #751: K-CASE-008 reported `RELEVANT_DRIFT`; this should have blocked merge until reacceptance.
- PR #879: Admin Browser Acceptance was red; even though later descendants passed and the failure was outside the Gazette changes, it should have been explicitly classified before merge.
- IP Australia live failures observed across unrelated PRs are tracked in #890; persistent red noise must be fixed rather than silently ignored.

## Merge checklist

Before merging:

1. Required contexts are green on the exact PR head.
2. Relevant conditional acceptance has run and passed.
3. Every other red/pending check is classified in the PR conversation.
4. Any blocking dependency drift has an audited reacceptance, not a bypass.
5. If the head changes, repeat the assessment on the new head.
