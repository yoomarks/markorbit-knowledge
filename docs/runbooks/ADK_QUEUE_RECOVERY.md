# ADK Queue Recovery Runbook

Use this runbook only for durable ADK queue recovery. It never authorizes a new production pilot and never calls an AI provider.

## 1. Inspect before recovery

Record the target Knowledge SQLite database and stop any operator process that could intentionally mutate the same queue. Do not delete or rewrite RawArtifacts.

## 2. Run safe stale-state recovery

Set `MARKORBIT_ADK_QUEUE_DB_PATH` and run:

```bash
pnpm --filter @markorbit/worker adk:queue:recover
```

The default stale threshold is 30 minutes. Override it with `MARKORBIT_ADK_QUEUE_STALE_MINUTES` when there is an explicit operational reason.

The command applies these rules:

- stale `CLAIMED` -> `QUEUED`;
- stale `RUNNING` -> `BLOCKED_RECOVERY`;
- `RETRY_PENDING` remains unchanged unless `MARKORBIT_ADK_QUEUE_REQUEUE_RETRY_PENDING=true`;
- `BLOCKED_CREDENTIAL` remains unchanged unless `MARKORBIT_ADK_QUEUE_REQUEUE_CREDENTIAL_BLOCKED=true`.

## 3. Requeue provider failures deliberately

A retryable provider failure may be requeued only by explicitly setting:

```bash
MARKORBIT_ADK_QUEUE_REQUEUE_RETRY_PENDING=true
```

A credential-blocked job may be requeued only after runtime credentials have been corrected, by explicitly setting:

```bash
MARKORBIT_ADK_QUEUE_REQUEUE_CREDENTIAL_BLOCKED=true
```

Neither flag accepts or stores a credential value.

## 4. Reconcile BLOCKED_RECOVERY manually

Do not requeue `BLOCKED_RECOVERY` automatically. It means provider execution or artifact persistence is uncertain. Inspect the job's error, submission/artifact evidence, and RawArtifact lineage before deciding whether a separately authorized execution is needed.

Typical reasons include:

- `AI_STALE_RUNNING_REQUIRES_RECONCILIATION`;
- `AI_ARTIFACT_PERSISTENCE_UNCERTAIN`;
- `AI_ACQUISITION_LINEAGE_REQUIRES_RECONCILIATION`.

The recovery command intentionally has no path that changes `BLOCKED_RECOVERY` back to `QUEUED`.
