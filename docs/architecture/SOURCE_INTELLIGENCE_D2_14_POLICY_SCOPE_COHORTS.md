# Source Intelligence D2.14 — Policy Scope & Cohorts

## Purpose

D2.14 adds explicit human policy scoping above D2.13 Manual SLA & Escalation. Different Source cohorts may use different claim/review workflow targets without deriving cohort membership from Source metadata and without creating automatic routing or execution authority.

D2.14 is a workflow-policy layer. It is not Source classification, evidence adjudication, staffing inference, collection authorization, or Scheduler calibration.

## Inputs

D2.14 reads:

- the D2.13 global manual SLA policy as fallback;
- human-created policy cohorts;
- explicit human-created Source → cohort memberships;
- a bounded set of Source IDs requested by the operator view.

It does not inspect domain names, organizations, jurisdictions, categories, Source Value, Evidence Maturity, Authority, Acquisition Cost, review flags, or graph relationships to infer membership.

## Cohort record

A cohort contains:

- `cohortId`;
- human label and optional description;
- numeric `priority`;
- enabled/disabled state;
- claim target hours;
- review target hours;
- last human updater and update time.

Targets may be `null`. A null target inside the winning cohort explicitly disables that clock. It does not inherit that individual target from Global.

## Precedence

Effective policy precedence is deliberately simple and observable:

1. Consider only enabled cohorts that have an explicit membership for the Source.
2. Higher numeric `priority` wins.
3. Enabled cohort priorities must be unique. Persistence rejects an attempted priority collision instead of inventing a hidden tie-break rule.
4. If no enabled cohort matches, the D2.13 global policy is used as fallback.
5. If no enabled cohort matches and no global policy exists, the Source is `UNCONFIGURED` and both clocks are disabled.

A Source may belong to several cohorts. All enabled matches are returned to the operator view, while the highest-priority cohort is the effective policy.

Disabled cohorts do not participate in precedence. Their memberships remain explicit workflow metadata and can become effective again only after a human re-enables the cohort.

## Persistence

D2.14 adds two dedicated workflow tables:

- `source_intelligence_policy_cohorts`;
- `source_intelligence_policy_cohort_memberships`.

Cohort updates use `expectedUpdatedAt` optimistic concurrency.

Membership mutations use `expectedPresent` optimistic concurrency. The supported actions are:

- `ADDED`;
- `REMOVED`.

No membership is created because a Source happens to match a category, domain, authority level, jurisdiction, organization, Source Value band, or other attribute.

## D2.13 integration

D2.13 keeps its global policy record and existing escalation semantics.

When D2.14 is present, the review service builds an effective policy for each requested Source and passes those effective targets into the D2.13 clock projection:

- cohort-scoped Sources use the winning cohort targets;
- non-matching Sources use the D2.13 global fallback;
- unconfigured Sources have disabled clocks.

This changes only workflow target calculation. It does not mutate:

- D2.7 observation history;
- D2.8 cross-source flags;
- D2.9 review disposition;
- D2.10 review activity;
- D2.11 ownership/handoff history;
- D2.13 escalation state.

## API

`GET /api/source-intelligence/reviews/policy-scopes?protocolVersion=2.0&sourceIds=...`

Returns:

- global fallback policy;
- all cohorts;
- memberships relevant to the requested Sources;
- effective policy per Source;
- source/cohort/membership counts.

`PUT /api/source-intelligence/reviews/policy-scopes`

Creates or updates one cohort. Writes require:

- protocol `2.0`;
- explicit operator label;
- explicit priority;
- explicit enabled state;
- explicit claim/review targets or `null`;
- `expectedUpdatedAt`.

`POST /api/source-intelligence/reviews/policy-scopes`

Adds or removes one explicit Source membership. Writes require:

- protocol `2.0`;
- cohort ID;
- Source ID;
- human actor;
- `ADDED` or `REMOVED`;
- `expectedPresent`.

## Admin presentation

`/intelligence` presents D2.14 before D2.13 so the operator sees and edits policy scope before reviewing SLA clocks.

The D2.14 panel shows:

- cohort counts and effective-scope counts;
- human cohort editor;
- explicit Source membership editor;
- cohort membership summaries;
- effective policy per Source;
- matched-cohort count when a Source belongs to more than one enabled cohort;
- clear no-inference / no-routing boundary language.

The intended Source Intelligence order is:

1. D2.14 Policy Scope & Cohorts;
2. D2.13 Manual SLA & Escalation Policy;
3. D2.12 Assignment Health & Capacity;
4. D2.11 Operator Ownership & Handoff;
5. D2.10 Review Queue Operational Health;
6. D2.9 Operator Review Queue;
7. D2.6 Source Value × Evidence Maturity workbench.

## Governance invariants

D2.14 does not:

- infer cohort membership;
- classify Sources as a truth claim;
- infer Authority;
- verify legal truth;
- verify professional quality;
- resolve cross-source identity;
- qualify MGSN;
- authenticate operator labels;
- infer permissions or RBAC;
- automatically assign ownership;
- automatically route work;
- automatically escalate;
- automatically notify;
- automatically remediate;
- create or mutate CollectionPlans;
- authorize collection;
- tune cadence;
- calibrate or authorize Scheduler behavior.

Scheduler remains:

`policyStatus = NOT_AUTHORIZED_UNCALIBRATED`.

## Non-goals

D2.14 intentionally does not implement dynamic rule-based cohorts, jurisdiction inference, source-type inference, organizational identity matching, auto-tagging, role qualification, manager routing, workload rebalancing, notification delivery, contractual SLA logic, statutory deadline calculation, collection authorization, or automatic execution.
