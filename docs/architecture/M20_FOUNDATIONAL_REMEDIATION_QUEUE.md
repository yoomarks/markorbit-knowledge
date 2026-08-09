# M20 — FOUNDATIONAL Remediation Queue

## Goal

M20 turns the existing FOUNDATIONAL readiness gate into a deterministic operator queue.

M19 already tells us the **first actionable stage** for every FOUNDATIONAL target. M20 keeps that ordering and adds a concrete operator action without creating a second source of truth for readiness.

The queue is an operational navigation layer, not an autonomous repair system.

## Pipeline position

The current readiness chain is:

`REGISTER → COLLECT → INGEST → CONVERT → INDEX → QUALITY → RELEVANCE → HEALTH → READY`

M20 emits queue items only for targets that are not `READY`, ordered by that first actionable stage.

A target therefore gets one current operational focus. Later-stage problems do not hide an earlier supply problem.

## Output

`operate:foundational` now returns its existing operator-batch result plus:

```json
{
  "remediationQueue": {
    "protocolVersion": "1.0",
    "objectType": "FOUNDATIONAL_REMEDIATION_QUEUE",
    "jurisdiction": "US",
    "state": "ACTION_REQUIRED",
    "totalTargetCount": 11,
    "actionableTargetCount": 2,
    "executionPolicy": "ADVISORY_ONLY",
    "collectionAuthorization": "UNCHANGED_EXPLICIT_ONLY",
    "semanticJudgment": false,
    "items": []
  }
}
```

Each queue item includes:

- coverage `targetId`
- jurisdiction
- deterministic stage priority
- M19 reason and merged operational gaps
- supply health state
- structural retrieval-quality state
- deterministic relevance-audit state
- one or more operator actions

Every action has `automaticExecution: false`.

## Stage-to-action mapping

| Stage       | Queue action                      | Boundary                                                                         |
| ----------- | --------------------------------- | -------------------------------------------------------------------------------- |
| `REGISTER`  | `REGISTER_SOURCE`                 | Source registration only; no collection authorization                            |
| `COLLECT`   | `DISPATCH_GOVERNED_COLLECTION`    | Existing explicit operator approval remains mandatory                            |
| `INGEST`    | `REVIEW_INGEST_EVIDENCE`          | Immutable captured evidence only                                                 |
| `CONVERT`   | `RUN_CONVERSION_RECOVERY`         | Existing governed conversion recovery; failed history remains immutable          |
| `INDEX`     | `REINDEX_VERIFIED_CANONICAL`      | Verified ReadyPackage/canonical Markdown only                                    |
| `QUALITY`   | `OPEN_RETRIEVAL_REMEDIATION_PLAN` | M16 plans; M17 executes only explicitly approved policy-eligible derived repairs |
| `RELEVANCE` | deterministic review actions      | M18 smoke audit only; no semantic/legal scoring                                  |
| `HEALTH`    | `REVIEW_SUPPLY_HEALTH`            | Inspect the existing supply-health gaps                                          |

`READY` targets are omitted from the queue.

## Structural quality boundary

M20 deliberately does **not** duplicate the M16 gap-to-remediation planner.

When M19 stops a target at `QUALITY`, M20 points the operator to `/api/retrieval/remediation`. M16 remains the source of truth for structural remediation planning. If M16 proposes an M17-safe action, M17 still requires explicit approval and its own execution policy checks.

M20 never calls the M17 executor itself.

## Relevance boundary

For `RELEVANCE`, M20 translates M18/M19 operational gaps into review tasks:

- audit coverage inconsistency → `REVIEW_RELEVANCE_AUDIT_COVERAGE`
- missing curated probe → `REVIEW_RELEVANCE_PROBE_CONFIG`
- expected source-filtered query miss → `REVIEW_SOURCE_FILTERED_RETRIEVAL`
- expected source absent from global top K → `REVIEW_GLOBAL_RETRIEVAL_RANKING`
- other relevance-stage state → `REVIEW_RELEVANCE_AUDIT`

These are review instructions only. M20 does not:

- generate probes with an LLM
- auto-edit curated probes
- auto-tune BM25 or ranking
- claim semantic relevance
- claim legal correctness

## Collection authorization

The collection boundary is unchanged.

A `COLLECT` queue item sets `collectionAuthorizationRequired: true` and points back to the existing FOUNDATIONAL operator explicit-dispatch path. Merely creating or viewing the queue never authorizes acquisition.

The queue cannot broaden the curated source catalog or silently add source targets.

## CLI behavior

Generic jurisdiction operator:

```bash
pnpm --filter @markorbit/worker operate:foundational -- --jurisdiction=US
```

WIPO:

```bash
pnpm --filter @markorbit/worker operate:foundational -- --jurisdiction=WO
```

Legacy US wrapper:

```bash
pnpm --filter @markorbit/worker operate:foundational:us
```

All three continue to preserve the existing review/dispatch behavior. They now also expose the queue in the returned JSON.

## Non-goals

M20 does not:

- mutate source, artifact, canonical, retrieval, or audit state
- dispatch collection without the existing explicit approval flag
- execute M16/M17 remediation
- retry conversions by itself
- rebuild chunks or FTS by itself
- edit M18 probes or ranking by itself
- use an LLM to choose the next action
- make legal, deadline, applicability, or answer-quality judgments

The queue is a deterministic operational control surface over the evidence and retrieval pipeline already established by M7–M19.
