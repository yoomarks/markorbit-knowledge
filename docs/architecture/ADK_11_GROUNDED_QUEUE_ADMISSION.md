# ADK-11 Grounded PREPARED Queue Admission

## Objective

Integrate governed PREPARED grounded-execution evidence with the existing ADK-07 queue without making a DeepSeek, OpenAI, or other provider adapter reachable from that queue entry.

Queue admission is deliberately separated from provider-execution authorization. A grounded execution may be deduplicated, persisted, claimed, inspected, and recovery-audited while provider execution remains disabled.

## Queue identity

A grounded queue job is admitted only from a valid `AiGroundedPreparedExecutionEvidenceV1` and freezes:

- `executionMode = GROUNDED_PREPARED`;
- `provider = PROVIDER_DISABLED`;
- `groundedExecutionInputSha256 = <exact PREPARED evidence executionInputSha256>`;
- `executionKey = grounded-prepared:<executionInputSha256>`;
- `maxAttempts = 1`;
- zero output artifact ids at admission.

The existing ADK-07 execution-key uniqueness boundary therefore deduplicates restarts using the immutable governed execution input rather than a mutable wall-clock run identity.

The persisted job parser rejects grounded jobs whose provider, SHA-256, or execution key does not match this shape. Existing jobs without an explicit execution mode remain `LEGACY_PROVIDER` for backward compatibility.

## Worker fail-closed boundary

The generic ADK-07 worker checks execution mode immediately after the atomic `QUEUED -> CLAIMED` transition.

For `GROUNDED_PREPARED` jobs it performs a compare-and-swap `CLAIMED -> BLOCKED_EXECUTION` transition and returns before:

- `RUNNING` is entered;
- Assignment lookup is performed;
- a provider adapter is selected;
- provider credentials are read by an adapter;
- `adapter.acquire(...)` is called;
- the provider-output sink is called.

A correctly formed grounded job is blocked with `AI_GROUNDED_PROVIDER_EXECUTION_DISABLED`. A malformed grounded identity is blocked with `AI_GROUNDED_QUEUE_IDENTITY_INVALID`.

`BLOCKED_EXECUTION` is not part of automatic retry or stale-job recovery. Existing recovery controls for `RETRY_PENDING`, `BLOCKED_CREDENTIAL`, stale `CLAIMED`, and stale `RUNNING` jobs therefore cannot silently promote a grounded PREPARED job into a provider call.

## Operator admission

From the repository root, run the dedicated worker entrypoint without adding a package-level script that would fan out unrelated live workflow path filters:

```sh
pnpm --filter @markorbit/worker exec tsx src/run-adk-grounded-queue-enqueue.ts
```

The command reads:

- `MARKORBIT_ADK_QUEUE_DB_PATH`;
- `MARKORBIT_ADK_GROUNDED_EXECUTION_INPUT_SHA256`.

It loads the exact canonical PREPARED evidence from `SqliteAiGroundedPreparedExecutionEvidenceRepository` before admission. It does not accept an arbitrary prompt file or arbitrary job JSON and does not read provider secrets.

Re-enqueuing the same canonical evidence returns the existing job. A conflicting job already occupying the same immutable execution key is rejected.

## Current authority boundary

This slice establishes queue admission and queue/recovery semantics only. It does **not**:

- authorize provider execution;
- transition grounded jobs to `RUNNING`;
- call DeepSeek, OpenAI, or another provider;
- read provider credentials for grounded jobs;
- allow external browsing;
- semantically verify claims;
- verify legal truth;
- activate candidates;
- authorize protected actions or client filings.

A future provider-execution slice must introduce an explicit, separately governed authorization object and transition. It must not reinterpret `QUEUED`, `CLAIMED`, PREPARED evidence, or `BLOCKED_EXECUTION` as execution authority. Real paid-provider execution remains gated by ADK-06 live acceptance issue #405 and repository governance issue #429.
