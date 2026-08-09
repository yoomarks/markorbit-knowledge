# Source Intelligence D2.15 — Policy Audit & Change History

## Purpose

D2.15 adds an append-only operational audit layer for the human workflow configuration introduced by D2.13 and D2.14.

It answers a narrow set of operational questions:

- who changed the global review targets;
- when a cohort was created or edited;
- when a cohort priority or enabled state changed;
- when a Source was explicitly added to or removed from a cohort;
- what workflow configuration values changed before and after the mutation.

D2.15 is an audit/read layer. It does not create new routing, escalation, collection, scheduling, authority, or legal-verification powers.

## Audited scopes

D2.15 records three scopes.

### Global policy

The D2.13 global workflow policy now appends an event whenever a human saves:

- `claimTargetHours`;
- `reviewTargetHours`.

The current D2.13 snapshot remains the source for current global fallback behavior. The event table is audit history only.

### Cohort policy

D2.14 cohort writes append events for:

- cohort creation;
- cohort update;
- name;
- description;
- numeric priority;
- enabled state;
- claim target;
- review target.

The current D2.14 cohort table remains the source for effective precedence. Audit history never participates in precedence calculation.

### Source membership

D2.14 membership changes append events for:

- explicit add;
- explicit remove.

Membership audit does not infer why a Source belongs to a cohort. It records only the human workflow mutation that was actually made.

## Append-only persistence

D2.15 adds append-only event tables alongside the existing current-state tables:

- `source_intelligence_manual_sla_policy_events`;
- `source_intelligence_policy_cohort_events`;
- `source_intelligence_policy_membership_events`.

Current snapshots are still stored in their D2.13/D2.14 tables. Each new human mutation writes the current snapshot and its audit event inside the same SQLite transaction so the current state and append-only history do not silently diverge.

## Snapshot backfill

D2.13 and D2.14 may already contain workflow state when D2.15 is introduced. D2.15 therefore creates at most one `SNAPSHOT_BACKFILL` event for an existing current Global Policy, Cohort, or membership that has no D2.15 audit history.

A snapshot backfill means only:

> this current workflow state existed when D2.15 audit became available.

It does **not** claim that D2.15 reconstructed every mutation that occurred before audit was enabled.

Backfill uses the current snapshot's recorded `updatedBy` / `addedBy` label and timestamp as snapshot attribution. Those labels are not authenticated identities and must not be interpreted as verified human identity.

Backfill event IDs are deterministic so repeated repository initialization does not create duplicate synthetic history.

## Event model

All D2.15 events project to a common protocol `2.0` event shape containing:

- event id;
- scope;
- action;
- actor label;
- occurrence time;
- optional policy/cohort/source identity;
- field-level before/after change set;
- historical completeness: `EVENT_SOURCED` or `SNAPSHOT_BACKFILL`.

Supported actions are:

- `GLOBAL_POLICY_CHANGED`;
- `COHORT_CREATED`;
- `COHORT_UPDATED`;
- `MEMBERSHIP_ADDED`;
- `MEMBERSHIP_REMOVED`;
- `SNAPSHOT_BACKFILL`.

## Read projection

`buildSourceIntelligencePolicyAuditHistoryV2` merges Global Policy, Cohort, and membership events, de-duplicates by event id, sorts newest first, applies a bounded visible-event limit, and returns descriptive counts.

The ordering is presentation only. It is not Scheduler priority, work routing, alert priority, or action authorization.

## API

D2.15 exposes a read-only endpoint:

`GET /api/source-intelligence/reviews/policy-audit?protocolVersion=2.0`

Optional parameters:

- `sourceIds` — limits membership events to the explicitly listed Sources; Global and Cohort configuration history remain visible;
- `eventLimit` — bounded to 1–500.

D2.15 adds no mutation endpoint. Mutations continue to occur only through the explicit D2.13 and D2.14 human workflow APIs, which now append audit events atomically.

## Admin UI

`/intelligence` presents D2.15 before D2.14 and D2.13 because audit answers what changed before the operator inspects or modifies current policy scope.

The panel shows:

- visible event count;
- Global Policy events;
- Cohort events;
- membership events;
- snapshot-backfill count;
- recent operator labels;
- newest-first event timeline;
- field-level before/after changes;
- explicit incomplete-history marking for snapshot backfills.

The panel is read-only apart from refresh.

## Semantics and boundaries

D2.15 preserves all Source Intelligence governance invariants.

- Audit history is workflow metadata only.
- Actor labels are recorded labels, not authenticated identity.
- Change sets describe workflow configuration, not legal truth or Source truth.
- Audit history does not change D2.14 effective-policy precedence.
- Audit history does not mutate D2.13 SLA clocks.
- Audit history does not mutate review disposition.
- Audit history does not mutate ownership/handoff state.
- Audit history does not change Source Value.
- Audit history does not change Evidence Maturity.
- Audit history does not infer Authority.
- Audit history does not verify professional quality.
- Audit history does not resolve cross-source identity.
- Audit history does not qualify MGSN.
- Audit history does not authorize collection.
- Audit history does not create or mutate CollectionPlan.
- Audit history does not tune cadence.
- Audit history does not notify operators automatically.
- Audit history does not route, assign, transfer, escalate, or remediate automatically.
- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.

## Non-goals

D2.15 does not implement:

- authenticated operator identity;
- RBAC or permission enforcement;
- cryptographic non-repudiation;
- contractual SLA audit;
- statutory/legal deadline history;
- automatic alerts;
- automatic rollback;
- automatic policy recommendations;
- automatic cohort assignment;
- automatic routing or rebalancing;
- Scheduler calibration;
- collection authorization;
- legal verification.

A later phase may add richer filtering, export, or authenticated identity adapters, but those are outside D2.15.
