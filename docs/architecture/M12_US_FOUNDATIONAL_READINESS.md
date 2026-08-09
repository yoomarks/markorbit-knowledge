# M12 — US FOUNDATIONAL End-to-End Readiness

## Purpose

M12 closes the operational gap between M8 foundational collection plans and M7 Source Supply Health.

The operator can now review the entire active US `FOUNDATIONAL` set as one batch, see exactly which pipeline stage blocks each target, and explicitly dispatch either selected targets or the full foundational set. Collection remains manual and operator-authorized.

```text
Source Coverage (US / FOUNDATIONAL / ACTIVE)
  ↓
registered SourceDefinition
  ↓
MANUAL Foundational Supply Plan
  ↓  explicit operator approval only
CollectionRun → RawArtifact
  ↓
automatic conversion / recovery (M9–M11)
  ↓
StagingDocument → RetrievalDocument
  ↓
11/11 Readiness Gate
```

## Operator command

Review only — prepares/reuses the existing MANUAL plans and performs **zero dispatch**:

```bash
pnpm --filter @markorbit/worker operate:foundational
```

Review a proposed full refresh without authorizing it:

```bash
pnpm --filter @markorbit/worker operate:foundational -- --dispatch-all
```

The result reports `approvalRequired: true` and still performs **zero dispatch**.

Dispatch selected targets:

```bash
pnpm --filter @markorbit/worker operate:foundational -- \
  --dispatch-target=us-uspto-tmep-current \
  --dispatch-target=us-uspto-trademark-fees \
  --approve-dispatch
```

Dispatch the complete active US foundational set:

```bash
pnpm --filter @markorbit/worker operate:foundational -- \
  --dispatch-all \
  --approve-dispatch
```

`--dispatch-all` and `--dispatch-target=...` are mutually exclusive.

## Readiness gate

The gate is computed from the existing `GET /api/source-supply-health` projection. No second health database or parallel truth model is introduced.

A target is assigned to its first actionable blocking stage:

| Stage      | Meaning                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `REGISTER` | coverage target is not registered as a SourceDefinition                           |
| `COLLECT`  | governed acquisition has not succeeded, has failed, or is stale                   |
| `INGEST`   | a collection completed but no governed RawArtifact was registered                 |
| `CONVERT`  | acquisition evidence exists but no READY normalized document exists               |
| `INDEX`    | normalized content exists but no current retrieval document exists                |
| `HEALTH`   | health projection is missing/inconsistent or otherwise cannot certify readiness   |
| `READY`    | registration, acquisition, normalization, retrieval and freshness are all healthy |

The aggregate gate is `READY` only when **every active US FOUNDATIONAL target** is `READY`. With the current M5 catalog this means **11/11**.

The gate derives its expected target set from the active catalog/plans rather than hard-coding 11, so a future catalog expansion automatically raises the denominator instead of silently preserving an obsolete threshold.

## Authorization boundary

M12 does not create a scheduler and does not convert coverage intent into collection permission.

- Default operation is review-only and dispatches zero runs.
- Supplying `--dispatch-all` or `--dispatch-target` without `--approve-dispatch` produces a review result with `approvalRequired: true` and dispatches zero runs.
- Only an explicitly approved batch is handed to M8's existing manual run dispatcher.
- Existing CollectionPlan scope, robots, rate-limit, timeout, attachment and artifact constraints remain unchanged.
- M9–M11 continue to own automatic conversion and conversion recovery after governed artifacts are created.

## Scope boundary

This milestone reports evidence-supply readiness only. It does not interpret source text into legal rules, requirements, deadlines, exceptions, applicability decisions or final trademark advice.
