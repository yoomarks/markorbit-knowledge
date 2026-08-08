# Source Intelligence D2.7 — Dual-Axis Observation History

## Status

D2.7 adds a read-only observation history for the calibrated Source Intelligence v2 operator model.

It records how **Source Value Priority**, **Evidence Maturity**, and the separate **Observed Acquisition Cost** context change across persisted evidence states. It does not add scheduling authority or autonomous collection behavior.

## Storage strategy

D2.7 does not introduce a new table or migrate Source Intelligence storage.

The existing `source_intelligence_assessments` table already persists v1 assessments append-only for distinct `(source_id, input_fingerprint)` pairs. D2.7 exposes those historical records through a bounded per-source read and projects every persisted v1 assessment into the v2 dual-axis model.

This preserves the existing compatibility rule:

- v1 is the persisted historical assessment;
- v2 is a read-compatible projection;
- protocol `1.0` remains the default API behavior;
- protocol `2.0` remains explicit opt-in.

## Observation unit

An observation is a **distinct evidence state**, not a polling event.

The existing uniqueness rule on `(source_id, input_fingerprint)` remains unchanged. Reassessing a source with the same fingerprint returns the existing assessment instead of creating a second timestamp-only point.

Consequences:

- meaningful source/evidence state changes produce new history points;
- identical repeated evaluations do not create fake movement;
- D2.7 is not a wall-clock sampling system;
- D2.7 does not currently model freshness decay when the underlying evidence fingerprint is unchanged.

## History contract

`SOURCE_INTELLIGENCE_OBSERVATION_HISTORY` uses protocol `2.0` and returns observations ordered from oldest to newest.

Each point records:

- v2 assessment ID;
- legacy v1 assessment ID;
- assessed time;
- input fingerprint;
- evaluator version;
- Source Value score and band;
- Evidence Maturity score and stage;
- Observed Acquisition Cost score and confidence.

Adjacent points produce an explicit transition containing:

- Source Value score delta and band change;
- Evidence Maturity score/stage transition;
- Acquisition Cost score change.

A maturity transition does not imply a Source Value change, and an Acquisition Cost change is never folded into either axis.

## Read API

The existing Source Intelligence endpoint remains backward compatible.

A caller may request history only for a single source with:

- `protocolVersion=2.0`
- `includeHistory=true`
- optional `historyLimit` from 1 to 100

Without `includeHistory=true`, the response shape remains the existing assessment response. Batch reads do not expose history in D2.7.

## Operator presentation

The source detail panel requests the latest v2 assessment together with a bounded observation history.

The history table presents newest observations first for operator readability while the contract remains chronological. It shows Source Value, Evidence Maturity, Acquisition Cost, and the change from the prior distinct evidence state.

The UI explicitly states that observation history does not create scheduling rules or collection authority.

## Governance invariants

D2.7 preserves all previous boundaries:

- `UNOBSERVED` is not low Source Value;
- Authority remains explicit-only;
- no authority inference from host, domain, organization, Source Value, or Evidence Maturity;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity verification;
- no CollectionPlan mutation;
- no automatic collection authorization;
- no MGSN qualification;
- no automatic scheduling.

Every observation history returns:

`policyStatus = NOT_AUTHORIZED_UNCALIBRATED`

## Explicit non-goals

D2.7 does not:

- tune rescan cadence;
- select collection targets;
- schedule workers;
- authorize a paused CollectionPlan;
- infer that a mature source is legally correct;
- infer that an unobserved source has low intrinsic value;
- create a new time-series database.

A later scheduler phase may consume calibrated observations only after a separate authorization and policy design step.
