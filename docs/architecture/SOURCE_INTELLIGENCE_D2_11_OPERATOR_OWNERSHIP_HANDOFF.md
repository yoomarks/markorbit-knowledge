# Source Intelligence D2.11 — Operator Ownership & Handoff

## Purpose

D2.11 turns the D2.9 human review queue into a collaboration surface for multiple operators.

It answers a narrow operational question:

> Who is currently responsible for reviewing this exact Observation occurrence, and how can that responsibility be explicitly handed to another human workflow label?

D2.11 does **not** authorize collection, scheduling, remediation, Source truth decisions, or legal/professional-quality judgments.

## Inputs

D2.11 consumes the current D2.9 review queue. Ownership is attached to the same exact Observation occurrence identity introduced by D2.9:

- Source id;
- D2.8 flag kind;
- current projected assessment id;
- previous projected assessment id when present;
- deterministic `sir_*` observation key.

A new distinct Evidence State that produces a new Observation occurrence therefore starts **unassigned**. Ownership from an older occurrence never silently carries forward.

## Ownership record

Current ownership is persisted separately from review disposition in:

`source_intelligence_observation_review_ownership`

The record stores:

- observation key;
- Source id;
- flag kind;
- current owner workflow label or `null`;
- actor that last changed ownership;
- assignment timestamp when assigned;
- last update timestamp.

The owner is deliberately a **workflow label**, not an authenticated MarkOrbit account identity. D2.11 does not infer permissions, employment, team membership, identity, or authority from that string.

## Handoff events

Every ownership mutation appends an event to:

`source_intelligence_observation_ownership_events`

Supported actions are:

- `CLAIMED` — unassigned → named owner;
- `TRANSFERRED` — one named owner → another named owner;
- `RELEASED` — named owner → unassigned.

Events store previous owner, new owner, actor, and occurrence time. This is an append-only handoff audit trail for operator workflow history.

## Optimistic concurrency

Every mutation includes `expectedOwner`.

The repository compares the submitted expectation with the currently persisted owner. If ownership changed after the UI was loaded, the write is rejected with a conflict instead of overwriting the newer handoff.

Additional invariants:

- an assigned item cannot be implicitly claimed by somebody else;
- takeover requires explicit `TRANSFERRED`;
- an unassigned item cannot be transferred;
- an already unassigned item cannot be released;
- transfer target must differ from the current owner.

This is workflow concurrency protection, not an authorization model.

## Stale Observation protection

Before a handoff is saved, the service rebuilds the current single-Source D2.9 queue and checks that the submitted `sir_*` occurrence is still current.

If the underlying distinct Evidence State has superseded the occurrence, the handoff is rejected as stale.

## Team and personal views

The D2.11 projection reports:

- assigned / unassigned counts;
- assigned pending / unassigned pending counts;
- owner workload summaries;
- current ownership for every D2.9 queue item;
- recent ownership events.

The admin UI provides:

- **Team view** — all current queue items;
- **My work** — items matching an explicitly supplied operator workflow label;
- **Unassigned** — items with no current owner;
- claim to current operator label;
- explicit transfer;
- transfer to current operator label;
- release back to unassigned;
- recent handoff history.

`My work` does not claim to represent an authenticated user session. It is a filter against the operator label entered in the UI.

## Review disposition remains independent

D2.11 ownership never changes the D2.9 disposition:

- `PENDING`;
- `ACKNOWLEDGED`;
- `IGNORED`.

A handoff also does not modify:

- Source Value;
- Evidence Maturity;
- Authority Level;
- Acquisition Cost;
- Source Graph evidence;
- D2.7 observation history;
- D2.8 deterministic flags;
- D2.10 health semantics.

## API

D2.11 adds:

`GET /api/source-intelligence/reviews/ownership?protocolVersion=2.0&sourceIds=...`

Optional:

- `ownershipEventLimit` — 1..500, default 100.

Mutation endpoint:

`POST /api/source-intelligence/reviews/ownership`

Required mutation fields:

- `protocolVersion: "2.0"`;
- `sourceId`;
- `observationKey`;
- `action`;
- `actor` workflow label;
- `expectedOwner` as string or `null`.

`owner` is required by semantics for `CLAIMED` / `TRANSFERRED` and omitted for `RELEASED`.

## Presentation order

The Source Intelligence operator surface becomes:

1. D2.11 Operator Ownership & Handoff;
2. D2.10 Review Queue Operational Health;
3. D2.9 Operator Review Queue;
4. D2.6 dual-axis Source Intelligence workbench.

This order reflects a human workflow: establish responsibility, understand queue health, make review decisions, then inspect detailed intelligence.

It is not Scheduler priority.

## Governance boundary

D2.11 preserves all Source Intelligence restrictions:

- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`;
- no automatic collection;
- no CollectionPlan creation or mutation;
- no automatic remediation;
- no autonomous alerts;
- no automatic workload routing;
- no cadence tuning;
- no Authority inference;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification.

Ownership means **a human workflow label is responsible for looking at an Observation occurrence**. It never means that person, label, or system is authorized to execute a collection or scheduling action.
