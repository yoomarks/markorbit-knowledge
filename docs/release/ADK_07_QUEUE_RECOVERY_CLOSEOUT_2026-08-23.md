# ADK-07 Queue Recovery Closeout

Date: 2026-08-23

## Scope

This closeout freezes the recovery behavior for the durable AI knowledge job queue.

## Recovery invariants

1. `RETRY_PENDING` is never consumed directly by a worker. It must be explicitly requeued.
2. `BLOCKED_CREDENTIAL` is never consumed directly by a worker. It may be explicitly requeued only after the operator has corrected runtime credentials.
3. A stale `CLAIMED` job may be requeued because provider execution has not started yet.
4. A stale `RUNNING` job is never automatically replayed. Its provider execution state is uncertain, so it is moved to `BLOCKED_RECOVERY` for reconciliation.
5. Once a provider returns successfully, a later RawArtifact or Markdown persistence failure is never converted into `RETRY_PENDING`. The job is moved to `BLOCKED_RECOVERY` so an automatic retry cannot produce a duplicate provider call.
6. A post-provider lineage conflict is also moved to `BLOCKED_RECOVERY` because durable artifacts may already exist and require reconciliation.
7. Recovery writes use compare-and-set status persistence so an operator cannot overwrite a job whose state changed concurrently.

## Operator command

`pnpm --filter @markorbit/worker adk:queue:recover`

Required environment:

- `MARKORBIT_ADK_QUEUE_DB_PATH`

Optional environment:

- `MARKORBIT_ADK_QUEUE_STALE_MINUTES` (default `30`)
- `MARKORBIT_ADK_QUEUE_REQUEUE_RETRY_PENDING=true` to explicitly requeue retry-pending jobs
- `MARKORBIT_ADK_QUEUE_REQUEUE_CREDENTIAL_BLOCKED=true` to explicitly requeue credential-blocked jobs

The command always evaluates stale `CLAIMED` and `RUNNING` jobs. Stale `CLAIMED` jobs are safely requeued; stale `RUNNING` jobs are quarantined in `BLOCKED_RECOVERY`.

## Authority boundary

Recovery does not call providers, resolve credentials, rank providers, verify legal truth, activate Assignment Candidates, or synthesize replacement evidence. `BLOCKED_RECOVERY` requires explicit reconciliation before any new provider execution is authorized.
