# Source Intelligence D2.10 — Review Queue Operational Health

## Purpose

D2.10 adds an operator-facing health view above the D2.9 Observation Review Queue.

The question is operational, not epistemic:

> Is the human review queue accumulating work, which observation patterns repeat, and what review activity has already happened?

D2.10 does **not** decide whether a Source is legally reliable, professionally high quality, identical to another Source, safe to collect automatically, or important enough to schedule.

## Inputs

D2.10 combines three bounded inputs:

1. the current D2.9 review queue;
2. D2.7 distinct Evidence State history, capped by the caller (admin defaults to 50 states per Source);
3. persisted human review events, capped by the caller (admin defaults to 200 events).

The current admin cohort remains capped at 100 Sources.

## Backlog age

For current `PENDING` review items D2.10 calculates descriptive wall-clock backlog age from the Observation Flag `observedAt` timestamp to the request-time `generatedAt` timestamp.

Buckets are:

- under 24 hours;
- 24–72 hours;
- 72 hours–7 days;
- at least 7 days.

This is **operator backlog age** only. It is not Source freshness, Evidence Maturity decay, collection cadence, or a Scheduler trigger.

## Recurrence

Historical Observation occurrences are reconstructed from existing distinct Evidence State history by replaying the same deterministic D2.8 rules over each historical prefix.

An occurrence keeps the D2.9 exact-occurrence identity:

- Source id;
- flag kind;
- current projected assessment id;
- previous projected assessment id when present.

D2.10 counts repeated `Source × Flag kind` pairs and exposes the latest occurrence time and occurrence count.

A repeated flag is descriptive only. It does not mean the Source is wrong, low quality, legally problematic, or eligible for automated collection.

## Operator attention order

D2.10 exposes a bounded `attention` view for current pending work. Ordering is deterministic:

1. D2.8 `ATTENTION` severity before `INFO`;
2. older pending backlog before newer backlog;
3. higher historical occurrence count as a tie-breaker;
4. stable Source / flag ordering.

This is a reading order for humans. It is explicitly **not Scheduler priority** and does not mutate `CollectionPlan.priority`.

## Review event history

D2.9 stored one current review snapshot per exact Observation occurrence. D2.10 adds an append-only review-event table:

`source_intelligence_observation_review_events`

Each operator write now records:

- event id;
- observation key;
- Source id;
- flag kind;
- action;
- previous review status;
- resulting review status;
- reviewer;
- optional note;
- event timestamp.

Actions are:

- `DISPOSITION_CHANGED`;
- `NOTE_UPDATED`;
- `REVIEW_TOUCHED`;
- `SNAPSHOT_BACKFILL`.

`SNAPSHOT_BACKFILL` is used once for a pre-D2.10 D2.9 snapshot when no event history exists for that occurrence. This preserves the known D2.9 state without pretending a full pre-D2.10 transition log exists.

## Health read model

`SOURCE_INTELLIGENCE_REVIEW_QUEUE_OPERATIONAL_HEALTH` reports:

- current queue size and status distribution;
- oldest pending backlog age;
- pending age buckets;
- historical Observation occurrence count;
- repeated Source × Flag pairs;
- maximum repeat count;
- current human attention order;
- human review-event counts;
- first-touch latency proxy where an Observation occurrence can be matched to a persisted event;
- Source-level queue / recurrence / review-event summaries;
- recent Source-level review events.

## API

D2.10 adds:

`GET /api/source-intelligence/reviews/health`

Required:

- `protocolVersion=2.0`;
- `sourceIds`.

Optional bounded parameters:

- `historyLimit` — 2..100, default 50;
- `reviewEventLimit` — 1..500, default 200.

The existing D2.9 queue and write endpoint remains unchanged.

## UI

`/intelligence` now presents, in order:

1. D2.10 Review Queue Operational Health;
2. D2.9 Operator Review Queue;
3. D2.6 dual-axis Source Intelligence workbench.

The health panel shows backlog cards, age buckets, review activity, operator attention order, recurrence patterns, and expandable Source-level review history.

## Governance invariants

D2.10 preserves all existing Source Intelligence boundaries:

- `UNOBSERVED` is not low Source Value;
- Authority Level is explicit-only;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification;
- no CollectionPlan creation or mutation;
- no collection authorization;
- no autonomous notification;
- no collection cadence tuning;
- no evidence-freshness decay model is introduced;
- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.

Human review events and health metrics are workflow metadata only.

## Non-goals

D2.10 does not implement automatic prioritization, recurring alerts, automatic remediation, automatic collection, Scheduler policy calibration, Source-quality adjudication, or legal verification.
