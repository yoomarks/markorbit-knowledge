# Source Intelligence D2.16 — Audit Query & Export

## Purpose

D2.16 makes the append-only D2.15 Policy Audit history practical for long-term human operational review. It adds bounded, explicit stored-field querying, deterministic keyset pagination, and deterministic JSON/CSV export.

D2.16 is read-only. It does not create, update, delete, approve, route, escalate, notify, schedule, collect, or remediate anything.

## Relationship to D2.15

D2.15 remains the audit source of truth for human workflow configuration changes:

- Global Manual SLA policy changes;
- Cohort creation and updates, including Priority changes;
- explicit Source membership additions/removals;
- clearly marked `SNAPSHOT_BACKFILL` records for current state that existed before D2.15 audit history.

D2.16 does not add a second audit store and does not mutate D2.15 events. It only reads the three D2.15 event streams and projects matching records.

## Query contract

Protocol version remains explicitly `2.0`.

Supported filters are stored-field filters only:

- `scopes`;
- `actions`;
- `actorLabels`;
- `sourceIds`;
- `cohortIds`;
- `occurredFromInclusive`;
- `occurredToExclusive`.

Filter arrays are trimmed, de-duplicated, and normalized deterministically before use.

### Actor labels

`actorLabels` matches the recorded workflow label exactly. It does not authenticate, resolve, merge, or infer an operator identity. D2.16 therefore cannot answer whether two labels represent the same person or whether a label is authorized to perform an action.

### Source filtering

`sourceIds` matches `event.sourceId` only.

This is deliberately narrower than an "affected Source" query. Global Policy and Cohort configuration events have no stored `sourceId`, so a Source filter does not infer that those events affected a Source through policy precedence or cohort membership.

D2.16 does not perform graph traversal, cohort-membership replay, historical policy resolution, or cross-source identity resolution to expand the filter.

### Cohort filtering

`cohortIds` matches the stored `event.cohortId`. It can match Cohort and Membership events. Global Policy events are not implicitly associated with a Cohort.

### Time filtering

Time boundaries use normalized ISO timestamps:

- `occurredFromInclusive`: event time must be greater than or equal to the boundary;
- `occurredToExclusive`: event time must be strictly less than the boundary.

When both are present, `from` must be earlier than `to`.

## Deterministic ordering and pagination

All D2.16 query and export results use the same newest-first ordering:

1. `occurredAt DESC`;
2. `eventId DESC` as the deterministic tie-breaker.

Pagination uses a keyset cursor containing only the last visible `(occurredAt, eventId)` pair. The cursor is base64url-encoded for transport.

The cursor is only a read position. It is not an authentication token, authorization grant, capability, lease, workflow state, or scheduler instruction.

Persistence applies the same keyset boundary before reading each D2.15 event stream. The runtime merges those already bounded streams, de-duplicates by `eventId`, and applies the same ordering.

Page size is bounded to 1–100; the default is 25.

## Deterministic export

D2.16 exposes JSON and CSV representations using the same normalized filters as interactive query.

The export reads at most 5,001 matching events per eligible source stream, then merges and sorts them and emits at most 5,000 events. The JSON export explicitly records whether the result was truncated.

The JSON export intentionally excludes `generatedAt`. For the same stored D2.15 events and the same normalized filters, the JSON payload is therefore deterministic.

CSV uses a fixed column order:

1. `eventId`
2. `occurredAt`
3. `scope`
4. `action`
5. `actorLabel`
6. `policyId`
7. `cohortId`
8. `sourceId`
9. `historicalCompleteness`
10. `changesJson`

CSV escaping follows normal quoted-field rules. `changesJson` preserves the D2.15 before/after change set as JSON inside a single CSV cell.

Export is a read representation only. It is not evidence of authenticated authorship, cryptographic non-repudiation, legal truth, statutory compliance, contractual SLA compliance, Source quality, or Authority status.

## API surface

Read-only query:

`GET /api/source-intelligence/reviews/policy-audit/query?protocolVersion=2.0`

Read-only export:

`GET /api/source-intelligence/reviews/policy-audit/export?protocolVersion=2.0&format=json|csv`

D2.15's existing history endpoint remains backward compatible.

D2.16 adds no POST, PUT, PATCH, or DELETE endpoint.

## Operator UI

`/intelligence` presents D2.16 before D2.15 so an operator can narrow the audit history before reviewing the broader chronological stream.

The panel provides:

- Scope and Action selectors;
- exact operator-label filter;
- explicit Source selector;
- exact Cohort ID filter;
- inclusive/exclusive time range;
- 25/50/100 page size;
- previous/next keyset navigation;
- JSON and CSV export for the applied filters.

The UI states that Source filtering does not infer affected Sources and that the cursor is not an authorization token.

## Governance boundaries

D2.16 preserves all prior Source Intelligence governance boundaries:

- no automatic Cohort assignment;
- no inferred Source classification;
- no automatic routing or rebalancing;
- no automatic escalation;
- no automatic notification;
- no automatic ownership assignment or transfer;
- no automatic remediation;
- no collection authorization;
- no CollectionPlan creation or mutation;
- no scheduler cadence tuning;
- no Source Value mutation;
- no Evidence Maturity mutation;
- no review-disposition mutation;
- no ownership mutation;
- no Authority inference;
- no legal-truth verification;
- no professional-quality verification;
- no cross-source identity resolution;
- no MGSN qualification;
- no authenticated operator identity or RBAC inference.

Scheduler remains:

`NOT_AUTHORIZED_UNCALIBRATED`

## Non-goals

D2.16 does not implement:

- full-text fuzzy audit search;
- inferred "affected Source" analysis;
- historical replay of effective policy state;
- authenticated identity or permissions;
- cryptographic signing or non-repudiation;
- automatic alerts or anomaly detection;
- automatic rollback;
- policy recommendations;
- dynamic Cohort rules;
- contractual/statutory deadline audit;
- scheduler calibration or collection authorization.
