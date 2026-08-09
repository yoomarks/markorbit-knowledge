# Source Intelligence D2.13 — Manual SLA & Escalation Policy

## Purpose

D2.13 adds an explicitly human-configured workflow target and escalation layer on top of D2.9–D2.12.

It answers operational questions such as:

- how long a current unassigned PENDING occurrence has remained unclaimed relative to a human-set target;
- how long the current owner has held a PENDING review relative to a human-set review target;
- which current occurrences a human has explicitly escalated;
- which current occurrences are over a configured workflow target but have not been manually escalated.

D2.13 is workflow metadata and presentation only. It is not Source Intelligence evidence, legal deadline logic, contractual SLA enforcement, collection authority, Scheduler policy, or execution authority.

## Human-configured policy

The current workflow policy is persisted under the fixed policy id:

`source-intelligence-review-workflow`

It has two optional targets:

- `claimTargetHours`;
- `reviewTargetHours`.

Each target is either `null` (disabled) or an integer from 1 to 8760 hours.

Every policy update records:

- the explicit operator workflow label that made the update;
- the update timestamp.

Policy writes use optimistic concurrency through `expectedUpdatedAt`. A stale browser state cannot silently overwrite a newer human policy update.

The operator label is workflow metadata only. D2.13 does not verify that it corresponds to an authenticated user, role, team, jurisdiction capability, or permission set.

## Claim target semantics

The claim clock applies only to a current D2.9 occurrence that is:

- `PENDING`; and
- currently unassigned in D2.11.

The clock starts at the current occurrence's D2.8 `observedAt` timestamp.

When the occurrence becomes assigned, or its review disposition is no longer `PENDING`, the current claim clock is considered complete.

D2.13 intentionally does not infer historical claim compliance from a truncated ownership-event window. D2.12 remains the descriptive source for bounded first-claim latency history.

Claim target states are:

- `DISABLED` — no human claim target is configured;
- `WITHIN_TARGET` — current unassigned PENDING workflow age is within the target;
- `OVER_TARGET` — current unassigned PENDING workflow age exceeds the target;
- `COMPLETED` — the current occurrence is assigned or no longer PENDING.

## Review target semantics

The review clock applies to a current occurrence that is:

- `PENDING`; and
- currently assigned to a D2.11 owner workflow label.

The review clock starts at the current ownership snapshot's `assignedAt` timestamp.

Because D2.11 resets `assignedAt` on claim or transfer, an explicit transfer resets the current-owner review clock. This is intentional: D2.13 measures the current owner's workflow tenure, not total end-to-end case age.

Review target states are:

- `DISABLED` — no human review target is configured;
- `NOT_STARTED` — the occurrence is PENDING but not currently assigned;
- `WITHIN_TARGET` — current assignment tenure is within the target;
- `OVER_TARGET` — current assignment tenure exceeds the target;
- `COMPLETED` — D2.9 disposition is no longer PENDING.

## Workflow age is not evidence freshness

D2.13 timers are human workflow clocks.

They do not:

- modify Evidence Maturity;
- create evidence freshness decay;
- change Source Value;
- alter Acquisition Cost;
- assert that a source is stale, current, authoritative, or legally valid.

A 72-hour overdue review target therefore means only that the current human workflow target has been exceeded.

## Manual escalation

Escalation is explicit human workflow state scoped to the exact D2.9 observation occurrence key.

Actions are:

- `ESCALATED`;
- `CLEARED`.

The current escalation snapshot stores:

- exact observation key;
- source id;
- flag kind;
- current escalated state;
- actor workflow label;
- optional note;
- update timestamp.

Every escalation or clearing also appends an immutable escalation event.

Writes use `expectedEscalated` optimistic concurrency. A stale operator view cannot silently overwrite a newer escalation decision.

A new observation occurrence gets a new D2.9 occurrence key and does not inherit escalation from the previous occurrence.

## No automatic escalation

An `OVER_TARGET` state does not automatically create escalation state.

Likewise, an escalation does not automatically:

- send a notification;
- assign or transfer an owner;
- alter D2.9 review disposition;
- create or mutate a CollectionPlan;
- authorize collection;
- dispatch a Worker;
- mutate Scheduler configuration;
- trigger remediation.

The projection exposes `overTargetAndNotEscalated` so a human can see the distinction between a timer condition and an explicit human escalation decision.

## Persistence

D2.13 adds dedicated SQLite workflow tables:

- `source_intelligence_manual_sla_policy` — current human policy snapshot;
- `source_intelligence_manual_escalations` — current exact-occurrence escalation snapshot;
- `source_intelligence_manual_escalation_events` — append-only escalation history.

These tables are separate from:

- D2.7 Source Intelligence observation history;
- D2.9 review disposition state;
- D2.10 review activity events;
- D2.11 ownership state and handoff events.

## API

D2.13 exposes:

`GET /api/source-intelligence/reviews/manual-sla?protocolVersion=2.0&sourceIds=...`

The optional `escalationEventLimit` is bounded to 1..500.

Policy updates use `PUT` with:

- protocol version;
- actor;
- claim target hours or `null`;
- review target hours or `null`;
- `expectedUpdatedAt`.

Manual escalation changes use `POST` with:

- protocol version;
- exact source id and observation key;
- `ESCALATED` or `CLEARED`;
- actor;
- optional note;
- `expectedEscalated`.

Before an escalation write, the service rebuilds the current single-source D2.9 queue and rejects superseded observation occurrences.

## Operator presentation

`/intelligence` presents D2.13 before D2.12 because the human target settings explain the target-state cards that follow.

The operator surface shows:

- editable human claim/review target hours;
- unassigned PENDING count;
- claim-over-target count;
- review-over-target count;
- manually escalated count;
- over-target-but-not-escalated count;
- per-occurrence claim/review clock state;
- manual escalation/clear controls and optional note;
- recent manual escalation events.

The ordering of items is presentation only. Escalated and over-target items are surfaced first for human attention, but that order is not a Scheduler priority or automatic routing policy.

## Governance boundaries

D2.13 preserves all prior Source Intelligence boundaries:

- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`;
- no automatic escalation;
- no automatic notification;
- no automatic assignment or workload balancing;
- no automatic remediation;
- no automatic collection;
- no CollectionPlan creation or mutation;
- no Authority inference;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification;
- no authenticated operator identity or permission inference.

## Non-goals

D2.13 does not implement contractual SLAs, statutory/legal deadline calculation, email/Slack alerts, push notifications, automatic owner changes, manager routing, role/jurisdiction qualification, staffing capacity, performance scoring, automatic remediation, Scheduler calibration, collection authorization, or execution policy.
