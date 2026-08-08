# Source Intelligence D2.8 — Cross-source Observation Flags

## Status

D2.8 is a read-only operator observation layer built on D2.7 distinct-evidence-state history.

It does **not** create a scheduler, authorize collection, verify legal truth, infer Authority, resolve identity across sources, or grant MGSN qualification.

## Purpose

D2.7 made change visible for one Source. D2.8 answers the next operator question:

> Across the current Source cohort, which recent state changes are worth looking at?

D2.8 intentionally uses the term **Observation Flag** rather than anomaly detection. Each flag is produced by an explicit deterministic rule and is only a prompt for human interpretation.

## Input model

The summary consumes bounded `SOURCE_INTELLIGENCE_OBSERVATION_HISTORY` objects.

The unit remains a **distinct evidence state**:

- persisted v1 assessment history remains the source of record;
- v2 remains a read-compatible projection;
- same-fingerprint reassessments remain collapsed;
- D2.8 compares only the latest distinct state with the immediately previous distinct state for each Source;
- no wall-clock polling series is manufactured.

The operator API requests only the latest two distinct states because D2.8 does not need deeper history to calculate its current flags.

## Observation rules

### 1. `HIGH_VALUE_UNOBSERVED`

Trigger when the latest state is:

- Source Value `VERY_HIGH` or `HIGH`; and
- Evidence Maturity `UNOBSERVED`.

Interpretation: a potentially important Source currently has no observed evidence state.

This is a **coverage-gap observation**, not permission to collect it.

### 2. `EVIDENCE_MATURITY_REGRESSION`

Evidence Maturity has the ordered stages:

`UNOBSERVED < CAPTURED < TRACEABLE < CURRENT_TRACEABLE`

Trigger when the latest distinct state has a lower stage than the previous distinct state.

Interpretation: the projected evidence state became less mature according to the calibrated v2 evidence model.

It does not assert that a legal proposition became false, that a website became unreliable, or that a professional source lost quality.

### 3. `SOURCE_VALUE_BAND_CHANGED`

Trigger when the latest Source Value band differs from the previous Source Value band.

Interpretation: the intrinsic source-value projection changed between two persisted states.

D2.8 does not infer the reason. In particular, it does not infer Authority from a domain, organization name, jurisdiction, or URL.

### 4. `ACQUISITION_COST_INCREASED`

Trigger when both previous and current observed acquisition-cost scores exist and the score rises by at least **20 points**.

Interpretation: the heuristic acquisition-footprint proxy increased materially enough to deserve operator inspection.

The score is not billing data and remains separate from Source Value and Evidence Maturity.

## Severity

D2.8 uses only two presentation severities:

- `ATTENTION` — high-value unobserved coverage gaps and evidence-maturity regressions;
- `INFO` — Source Value band transitions and material acquisition-cost proxy increases.

Severity is a presentation aid. It is not an execution priority and must not be mapped to scheduler cadence automatically.

## Cross-source summary

For a bounded cohort, the read model reports:

- total Source count in the requested cohort;
- assessed Source count;
- number of Sources with one or more current flags;
- counts for each flag kind;
- deterministic per-Source flags, ordered by severity and observation time.

The summary does not compare different Sources to establish identity, legal truth, professional quality, or authority.

## API evolution

The existing Source Intelligence API remains backward compatible:

- default protocol remains `1.0`;
- v2 remains explicit via `protocolVersion=2.0`;
- D2.7 single-Source history remains supported;
- D2.8 extends `includeHistory=true` to bounded `sourceIds` batch reads;
- `includeSummary=true` is valid only with `sourceIds`, `protocolVersion=2.0`, and `includeHistory=true`;
- batch size remains capped at 100 Sources;
- history depth remains bounded and D2.8 operator UI requests only 2 states.

## Operator presentation

The Source Intelligence workspace displays a cross-source observation panel before the detailed dual-axis table.

It shows:

- the four rule counts;
- assessed / requested / flagged Source counts;
- up to eight current flags with Source links;
- the observed state transition or current coverage gap;
- an explicit governance notice that flags are read-only observations.

## Governance invariants

Every D2.8 summary states:

- `legalTruthVerified = false`
- `authorityInferred = false`
- `professionalQualityVerified = false`
- `crossSourceIdentityResolved = false`
- `autoScheduleApplied = false`
- `grantsCollectionAuthority = false`
- `grantsMgsnQualification = false`
- Scheduler policy remains `NOT_AUTHORIZED_UNCALIBRATED`

## Non-goals

D2.8 does not:

- schedule rescans;
- tune cadence;
- create or mutate CollectionPlans;
- initiate collection;
- send autonomous alerts;
- infer source identity or ownership;
- decide legal or professional truth;
- replace the D2.7 per-Source history;
- create a time-series database.
