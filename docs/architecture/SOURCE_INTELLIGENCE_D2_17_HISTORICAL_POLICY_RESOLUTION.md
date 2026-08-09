# Source Intelligence D2.17 — Historical Policy Resolution & Impact Trace

## Purpose

D2.17 answers a narrow operator question: **for an explicit Source and an explicit historical instant, what human-configured workflow policy can the system prove was visible, and why?**

It does not turn audit history into execution authority. It does not infer affected Sources from Global or Cohort changes, classify Sources, verify operator identity, or reconstruct facts that D2.15 never recorded.

## Immutable coverage checkpoint

D2.15 introduced append-only policy mutation events, but snapshot backfills intentionally do not reconstruct deleted memberships or earlier missing mutations. D2.17 therefore does not pretend that all pre-D2.15 time is replayable.

The persistence layer creates exactly one immutable checkpoint:

- checkpoint id: `source-intelligence-policy-resolution-baseline`;
- checkpoint timestamp;
- current D2.13 Global policy snapshot;
- all current D2.14 Cohort snapshots;
- all current explicit Source↔Cohort memberships.

The checkpoint is captured inside one SQLite `BEGIN IMMEDIATE` transaction, so the snapshot and checkpoint time form a stable read-model baseline relative to policy writes in the same database.

The checkpoint is **coverage metadata only**. It is not a security audit anchor, compliance certification, signature, non-repudiation mechanism, or authorization object.

## Resolution states

### `RESOLVED / COMPLETE_FROM_CHECKPOINT`

For `asOf >= checkpointAt`, D2.17 starts from the immutable checkpoint and replays D2.15 policy events after the checkpoint through the requested instant.

A resolved policy is returned only when:

- all replay streams fit the bounded event window;
- no same-object same-timestamp ambiguity is present;
- the requested instant is at or after the checkpoint.

### `PARTIAL / PARTIAL_PRE_CHECKPOINT`

For `asOf < checkpointAt`, D2.17 may replay the stored D2.15 events as an **observed** projection, but it never calls that projection complete.

This protects against histories D2.15 cannot recover, including a Source↔Cohort membership that existed and was removed before append-only audit capture began.

`SNAPSHOT_BACKFILL` can contribute observed state, but it never upgrades completeness.

### `UNKNOWN`

D2.17 refuses to claim a resolved result when:

- a replay stream exceeds 5,000 events; or
- multiple mutations for the same workflow object share the same timestamp and stored ordering is insufficient to establish state.

The response still exposes explicit reasons rather than choosing a guessed state.

## Replay semantics

D2.17 reuses D2.14 policy semantics:

1. only explicit Source↔Cohort memberships participate;
2. only enabled Cohorts participate in precedence;
3. higher numeric Cohort priority wins;
4. the winning Cohort replaces Global as a whole policy;
5. a `null` Cohort target explicitly disables that clock;
6. when no enabled explicit Cohort wins, Global is the fallback;
7. when neither exists, the Source is `UNCONFIGURED`.

No membership is inferred from domain, organization, Source category, geography, Source Value, Evidence Maturity, Authority, graph structure, or identity matching.

## Impact trace

Each Source result contains a read-only trace made from:

- the checkpoint baseline when applicable;
- direct membership mutations for that Source;
- Cohort mutations for observed matched Cohorts;
- Global mutations when Global is the observed fallback;
- one precedence explanation.

This is an explanation of **stored workflow configuration**, not a claim that an audit event automatically affected or executed work for the Source.

## API

`GET /api/source-intelligence/reviews/policy-resolution`

Required query parameters:

- `protocolVersion=2.0`
- `sourceIds=<comma-separated explicit source ids>`
- `asOf=<ISO instant>`

Future `asOf` values are rejected because D2.17 does not forecast future policy state.

## UI

`/intelligence` presents D2.17 before D2.16.

The panel allows an operator to:

- select an explicit Source;
- select an historical instant;
- inspect RESOLVED / PARTIAL / UNKNOWN status;
- compare resolved vs observed policy;
- see the immutable checkpoint timestamp;
- inspect the replay/precedence trace.

There are no rollback, apply, route, notify, assign, collect, or scheduler controls.

## Governance boundaries

D2.17 does **not**:

- authorize automatic collection;
- create or mutate CollectionPlan;
- authorize Scheduler cadence;
- auto-assign or rebalance ownership;
- auto-escalate or notify;
- auto-apply or rollback policy;
- infer Cohort membership;
- infer Source classification;
- mutate Source Value or Evidence Maturity;
- infer Authority;
- verify legal truth or professional quality;
- authenticate operator labels;
- infer RBAC/permissions;
- resolve cross-source identity;
- grant MGSN qualification.

Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.
