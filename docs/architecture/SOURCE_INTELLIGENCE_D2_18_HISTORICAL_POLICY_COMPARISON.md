# Source Intelligence D2.18 — Historical Policy Comparison & Change Explanation

## Purpose

D2.18 answers one read-only operator question: **for the same explicit Source, what can the system prove changed between two historical D2.17 policy-resolution instants?**

It compares two D2.17 endpoint resolutions. It does not create a second replay engine and it never upgrades D2.17 completeness.

## Endpoint rules

- `fromAsOf` must be strictly earlier than `toAsOf`.
- Both endpoints use the same immutable D2.17 coverage checkpoint.
- Both endpoints contain the identical explicit Source set.
- Future endpoints remain rejected by D2.17.

## Comparison states

### `RESOLVED`

D2.18 returns a proven `CHANGED` or `UNCHANGED` result only when both D2.17 endpoints for the Source are `RESOLVED` with a resolved effective policy.

A change is a field-level comparison of:

- scope;
- winning Cohort id/name;
- Cohort priority;
- claim target;
- review target;
- explicit matched Cohort ids.

### `PARTIAL`

If neither endpoint is `UNKNOWN` but one or both are `PARTIAL`, D2.18 returns `INDETERMINATE`. Observed endpoint policies may be displayed for context, but field differences are not promoted to proven historical changes.

### `UNKNOWN`

If either endpoint is `UNKNOWN`, D2.18 remains `UNKNOWN / INDETERMINATE` and carries the endpoint reasons forward. It never selects a guessed policy state.

## Trace delta

D2.18 may show event ids present in the later D2.17 endpoint trace but not the earlier endpoint trace. These are **newly observed trace ids only**.

They are not a proof that an audit mutation caused downstream workflow execution, and D2.18 does not infer indirect affected Sources from Global or Cohort events.

## API

`GET /api/source-intelligence/reviews/policy-comparison`

Required query parameters:

- `protocolVersion=2.0`
- `sourceIds=<comma-separated explicit source ids>`
- `fromAsOf=<ISO instant>`
- `toAsOf=<ISO instant>`

## UI

`/intelligence` presents D2.18 before D2.17.

Operators can select one explicit Source, choose two historical instants, and inspect:

- comparison state;
- both D2.17 endpoint completeness states;
- before/after effective policy when provable;
- field-level changes;
- newly observed trace ids;
- explanation and evidence-boundary copy.

There are no apply, rollback, routing, escalation, notification, collection, assignment, or Scheduler controls.

## Governance boundaries

D2.18 does **not**:

- upgrade `PARTIAL` or `UNKNOWN` history;
- infer affected Sources from Global/Cohort changes;
- prove audit-event causality;
- apply or rollback policy;
- auto-assign Cohort membership;
- auto-route or rebalance ownership;
- auto-escalate or notify;
- authorize collection or mutate CollectionPlan;
- mutate Source Value or Evidence Maturity;
- infer Source classification or Authority;
- authenticate operator labels or infer RBAC;
- verify legal truth or professional quality;
- resolve cross-source identity;
- grant MGSN qualification.

Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.
