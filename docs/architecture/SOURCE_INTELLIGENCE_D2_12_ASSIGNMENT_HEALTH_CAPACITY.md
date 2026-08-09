# Source Intelligence D2.12 — Assignment Health & Capacity

## Purpose

D2.12 adds a read-only human operations layer above D2.11 Operator Ownership & Handoff.

It answers four bounded questions:

1. How much current review work is still unassigned, and how old is that backlog?
2. How long have current assignments been held?
3. How quickly were current Observation occurrences first claimed when a visible CLAIMED event exists?
4. How is the current assigned workload distributed across operator workflow labels?

D2.12 does not assign work. It describes current workflow state so a human operator can decide whether a D2.11 claim, transfer, or release is appropriate.

## Inputs

D2.12 reads:

- the current D2.11 ownership queue;
- a bounded persisted window of D2.11 ownership events;
- the current wall clock only to compute presentation-time workflow ages.

It does not create new Source Intelligence evidence state and does not synthesize polling observations.

## Unassigned backlog age

Unassigned backlog age is calculated from the current D2.8/D2.9 occurrence `observedAt` to the D2.12 `generatedAt` time.

The pending buckets are:

- `<24h`;
- `24–72h`;
- `72h–7d`;
- `>=7d`.

This age is an operator workflow metric only. It is not Evidence Maturity, Source freshness, legal freshness, collection urgency, or a Scheduler cadence signal.

Future or clock-skewed timestamps are clamped to zero age for presentation rather than creating negative backlog.

## Current assignment tenure

D2.11 persists `assignedAt` on the current ownership snapshot.

D2.12 uses it to report current assignment tenure:

- oldest current assignment;
- oldest current assignment age;
- median current assignment age.

D2.11 resets `assignedAt` on both CLAIMED and TRANSFERRED actions. Therefore D2.12 assignment tenure means **time held by the current assignment**, not time since the Observation first entered the queue.

## First-claim latency

D2.12 computes a bounded first-claim latency sample for current Observation occurrences.

For each current occurrence, it searches the supplied ownership-event window for the earliest visible `CLAIMED` event with the exact same `observationKey`. When present:

`firstClaimLatency = first CLAIMED occurredAt - current occurrence observedAt`

D2.12 reports:

- number of current occurrences with a visible first-claim sample;
- median latency;
- p90 latency using nearest-rank selection.

This sample is intentionally incomplete when older ownership events fall outside the bounded event window. D2.12 never treats missing event history as an infinite claim delay or as proof that an occurrence was never claimed.

## Handoff activity

Within the bounded ownership-event window D2.12 reports visible counts of:

- CLAIMED;
- TRANSFERRED;
- RELEASED.

These are workflow-history counts only. They do not score operator quality or productivity.

## Operator load projection

For each current owner label D2.12 projects:

- assigned item count;
- pending / acknowledged / ignored counts;
- ATTENTION pending count;
- oldest pending workflow age;
- oldest current assignment tenure;
- visible claim count;
- visible transfer-in count;
- visible transfer-out count;
- visible release count.

The word `Capacity` in D2.12 means **observed current workload shape only**. MarkOrbit does not know from this model whether a person is working today, on leave, overloaded, highly skilled, authorized for a jurisdiction, or otherwise available.

Owner labels remain D2.11 workflow labels, not authenticated user identities.

## Workload shape

D2.12 exposes deterministic descriptive statistics across current owner labels:

- operator count;
- total assigned pending count;
- minimum pending count per current operator;
- maximum pending count per current operator;
- mean pending count;
- median pending count;
- pending spread (`max - min`);
- maximum pending share (`max / assigned pending`);
- coefficient of variation of current pending counts.

These metrics intentionally have no threshold that declares a team "balanced" or "imbalanced".

They are not routing scores and cannot trigger D2.11 ownership mutations.

## Deterministic operator presentation

Operator rows are presented using a deterministic human reading order:

1. more current pending items first;
2. older pending backlog first;
3. stable operator-label ordering.

This ordering is presentation only. It is not a Scheduler priority, staffing recommendation, or automatic assignment policy.

Oldest unassigned pending occurrences are similarly presented by workflow age, then stable Source / occurrence identity.

## API

D2.12 adds:

`GET /api/source-intelligence/reviews/assignment-health?protocolVersion=2.0&sourceIds=...`

Optional:

- `ownershipEventLimit`, bounded to `1..500`, default `500`.

The API is read-only.

## Admin UI

`/intelligence` presents the operator layers in this order:

1. D2.12 Assignment Health & Capacity;
2. D2.11 Operator Ownership & Handoff;
3. D2.10 Review Queue Operational Health;
4. D2.9 Operator Review Queue;
5. D2.6 Source Value × Evidence Maturity workbench.

The D2.12 panel shows:

- unassigned pending backlog and oldest age;
- first-claim latency sample;
- visible transfer count;
- workload-shape statistics;
- current per-operator load table;
- oldest unassigned pending occurrences.

## Governance boundaries

D2.12 preserves all previous Source Intelligence boundaries:

- `UNOBSERVED` is not low Source Value;
- Authority remains explicit-only;
- no legal truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification;
- no CollectionPlan creation or mutation;
- no collection authorization;
- no automatic assignment;
- no automatic workload balancing;
- no autonomous alerts or escalation;
- no cadence tuning;
- no evidence-freshness decay model;
- no authenticated operator identity or RBAC inference;
- Scheduler remains `NOT_AUTHORIZED_UNCALIBRATED`.

D2.12 metrics may support a later human decision in D2.11, but D2.12 itself cannot make or execute that decision.

## Non-goals

D2.12 does not implement:

- automatic routing;
- workload-balancing algorithms;
- staffing capacity declarations;
- SLA enforcement;
- operator performance scoring;
- role or jurisdiction eligibility;
- authenticated users;
- permissions or RBAC;
- notifications;
- automatic collection;
- automatic remediation;
- Scheduler calibration.
