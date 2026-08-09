# M21 — Foundational Remediation Queue Control-Plane API

## Purpose

M21 makes the M20 FOUNDATIONAL remediation queue available to control-plane consumers without requiring the worker CLI.

The milestone also moves the pure M15/M19 readiness evaluation and M20 queue derivation into `@markorbit/worker-runtime` subpath exports so the worker and admin control plane consume one implementation rather than maintaining parallel readiness or remediation rules.

## API

`GET /api/foundational/remediation-queue`

Required query parameters:

- `workspaceId`
- `jurisdiction` (for example `US` or `WO`)

Optional query parameters:

- `targetId` — restrict the snapshot to one explicitly curated ACTIVE + FOUNDATIONAL coverage target
- `topK` — positive integer from 1 through 20, forwarded only to the deterministic M18 relevance smoke audit

The response is a versioned `FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT` containing:

- workspace and jurisdiction scope;
- the M19 `FOUNDATIONAL_READINESS_GATE` snapshot;
- the M20 `FOUNDATIONAL_REMEDIATION_QUEUE`;
- `executionPolicy: READ_ONLY`;
- `collectionAuthorization: NONE`;
- `mutationPerformed: false`.

## Data path

The API reads the same persisted control-plane state already used by the existing operational endpoints:

1. ACTIVE + FOUNDATIONAL source-supply health;
2. M14 retrieval structural quality audit;
3. M18 deterministic retrieval relevance audit;
4. shared M15/M19 readiness evaluation;
5. shared M20 remediation queue derivation.

No HTTP self-calls are required inside the admin server and no worker process is spawned.

## Shared protocol boundary

Pure readiness and queue logic now live at:

- `@markorbit/worker-runtime/foundational-readiness`
- `@markorbit/worker-runtime/foundational-remediation-queue`

`apps/worker/src/source-foundational-readiness.ts` retains transport parsing, governed dispatch orchestration, and operator-mode behavior, while re-exporting and consuming the shared readiness protocol. `apps/worker/src/foundational-remediation-queue.ts` retains only the operator wrapper around the shared queue builder.

This keeps CLI and API behavior on one deterministic policy implementation.

## Safety boundary

M21 is read-only. A GET request does **not**:

- authorize or dispatch collection;
- retry conversion;
- ingest or rewrite RawArtifact evidence;
- rebuild retrieval chunks or FTS projections;
- execute M16/M17 remediation;
- edit relevance probes;
- tune BM25 ranking;
- broaden source coverage;
- invoke an LLM planner or relevance grader;
- make a legal correctness, deadline, applicability, or recommendation judgment.

All M20 queue actions continue to carry `automaticExecution: false`. A COLLECT-stage queue item continues to require the existing explicit foundational operator approval path.

## Validation expectations

M21 tests verify that:

- an empty US workspace exposes all 11 ACTIVE + FOUNDATIONAL targets as deterministic REGISTER-stage actions;
- WIPO and single-target filtering use the same generic path;
- the snapshot explicitly reports read-only/no-authorization/no-mutation semantics;
- unsupported target coverage and invalid `topK` inputs fail validation;
- existing worker readiness and remediation queue tests continue to exercise the shared implementations.
