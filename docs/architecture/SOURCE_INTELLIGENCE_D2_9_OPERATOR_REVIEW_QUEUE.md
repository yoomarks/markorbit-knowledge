# Source Intelligence D2.9 — Operator Review Queue

## Purpose

D2.9 turns the deterministic D2.8 cross-source Observation Flags into an operator workflow without turning those flags into execution authority.

The queue answers one bounded question:

> Which current Source Intelligence observation occurrences still need a human disposition, and what did the operator decide about each exact occurrence?

D2.9 does **not** answer whether a Source is legally authoritative, whether its content is professionally correct, whether two identities are the same, or whether collection should run.

## Review states

Every current D2.8 flag is presented with one of three operator-review states:

- `PENDING` — no current disposition, or an operator explicitly reopened the occurrence;
- `ACKNOWLEDGED` — the operator confirms that the observation deserves to remain visible as a reviewed operational fact;
- `IGNORED` — the operator chooses not to act on this occurrence.

A note can be attached to any state.

These states are workflow metadata only. They do not alter Source Value, Evidence Maturity, Acquisition Cost, Authority Level, Source Graph evidence, RawArtifact evidence, CollectionPlan state, or Scheduler policy.

## Exact observation occurrence identity

A review is scoped to one exact D2.8 flag occurrence using:

- Source id;
- flag kind;
- current projected assessment id;
- previous projected assessment id when present.

The tuple is hashed into a stable `sir_*` observation review key.

This prevents a critical semantic leak: an `IGNORED` or `ACKNOWLEDGED` decision must not silently carry forward after the Source receives a new distinct Evidence State.

If the current or previous assessment occurrence changes, the review key changes and the new flag returns to `PENDING`.

## Persistence boundary

D2.9 adds a dedicated table:

`source_intelligence_observation_reviews`

The table stores only human review workflow metadata:

- occurrence key;
- Source id;
- D2.8 flag kind;
- current / previous assessment ids;
- review status;
- reviewer;
- optional note;
- created / updated timestamps.

It does **not** migrate or replace Source Intelligence v1 assessment storage. Historical Source Intelligence remains persisted as v1 assessments, while D2.7/D2.8/D2.9 continue to project v2 semantics on read.

## Read path

The D2.9 queue is built from:

1. the bounded current Source cohort (maximum 100 Sources in the admin view);
2. each Source's latest two distinct D2.7 Evidence States;
3. the deterministic D2.8 cross-source summary;
4. persisted human dispositions matched by exact occurrence key.

Missing review state defaults to `PENDING`.

The queue reports:

- current flag count;
- pending count;
- acknowledged count;
- ignored count;
- current flag details and reason codes;
- Source link;
- operator note and reviewer where present.

## Write path and stale-decision protection

Before accepting a review write, the server rebuilds the current single-Source D2.8 summary and verifies that the submitted observation key is still current.

If the Source changed between page load and operator action, the write is rejected as stale and the operator must reload the queue.

This prevents a human disposition from being attached to an observation occurrence that has already been superseded by new evidence.

## API compatibility

D2.9 uses a dedicated endpoint:

`/api/source-intelligence/reviews`

The endpoint requires explicit `protocolVersion=2.0`.

- `GET` accepts a bounded `sourceIds` cohort and returns the current review queue;
- `POST` accepts one exact current occurrence plus `PENDING`, `ACKNOWLEDGED`, or `IGNORED`, with optional note / reviewer metadata.

The existing Source Intelligence API keeps its existing behavior. The default Source Intelligence protocol remains v1 unless v2 is explicitly requested.

## Operator UI

The Source Intelligence page now leads with the D2.9 Operator Review Queue before the D2.6 dual-axis workbench.

The queue defaults to `PENDING` and supports:

- pending / acknowledged / ignored / all filters;
- acknowledge;
- ignore;
- reopen to pending;
- save or revise notes;
- inspect deterministic D2.8 reason codes;
- navigate to the Source detail.

## Governance invariants

D2.9 preserves all prior Source Intelligence boundaries:

- `UNOBSERVED` does not mean low Source Value;
- Authority Level remains explicit-only;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification;
- no CollectionPlan creation or mutation;
- no collection authorization;
- no autonomous notification;
- no rescan cadence tuning;
- no automatic scheduling;
- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.

An operator clicking **确认** is not an instruction to collect or schedule. An operator clicking **忽略** does not suppress future distinct observation occurrences.

## Non-goals

D2.9 does not implement:

- Scheduler policy calibration;
- automatic remediation;
- automatic collection;
- recurring alerts;
- wall-clock monitoring;
- cross-source identity matching;
- legal or professional-quality adjudication.

Those capabilities require separate architecture decisions and cannot be inferred from a review disposition.
