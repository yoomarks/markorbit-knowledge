# ADK Live Pilot Runbook V1

Status: **implementation runbook; live acceptance still requires real execution evidence**

This runbook executes the ADK-06 3-topic × 2-provider live acceptance with the merged DeepSeek and OpenAI production adapters.

## Boundary

The preparation and live harnesses do not compare provider quality, score answers, verify legal truth, or activate Assignment Candidates. Preparation creates only an authenticated RawArtifact execution envelope. The live command executes frozen KnowledgeAssignments, preserves provider responses and Markdown derivatives, and emits auditable acquisition/RawArtifact lineage.

## Frozen plan requirement

Neither command creates a pilot plan on the fly. `MARKORBIT_ADK_LIVE_PLAN_PATH` must point to a pre-existing JSON document that satisfies `AiProductionPilotPlanV1` and contains:

- exactly three distinct durable US Trademark `kas_*` KnowledgeAssignment ids from `kal_us_trademark_core@1`;
- providers exactly in this frozen order: `DEEPSEEK`, `OPENAI`;
- an explicit `approvalRef`;
- `liveProviderCallsAuthorized: true`;
- all permanent authority-boundary flags set to false as required by the contract.

The plan is an explicit operator authorization artifact. Do not infer or generate `liveProviderCallsAuthorized: true` merely because the runtime is technically ready.

## Phase 1: prepare the authenticated runtime

Preparation is deliberately separate from provider execution and makes no external AI provider calls.

Use fresh, non-existing targets:

```text
MARKORBIT_ADK_LIVE_DB_PATH
MARKORBIT_ADK_LIVE_STORAGE_ROOT
MARKORBIT_ADK_LIVE_PLAN_PATH
MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH
MARKORBIT_ADK_LIVE_PREPARATION_RECEIPT_PATH
```

Run:

```bash
pnpm --filter @markorbit/worker adk:pilot:prepare
```

The preparation command performs these steps in order:

1. validates `AiProductionPilotPlanV1`, the exact `DEEPSEEK,OPENAI` provider order and all three Assignment ids before creating runtime state;
2. refuses to overwrite an existing database, storage root, runtime-secret file or preparation receipt;
3. seeds the immutable US Trademark Assignment Library into the fresh Knowledge SQLite registry and confirms the exact three frozen Assignments resolve;
4. creates one internal execution-envelope Source, CollectionPlan and CollectionRun;
5. creates and authenticates one production-mode Worker;
6. claims the exact execution-envelope Job rather than an arbitrary pending job;
7. starts the execution and moves it to `UPLOADING`, which is the state required by RawArtifact ingestion;
8. writes worker credential and lease token only into the exclusive runtime-secret JSON file, with private file mode where supported;
9. emits a separate non-secret preparation receipt containing ids and authority boundaries but no worker credential, lease token or provider key.

Preparation owns the fresh targets. If it fails after creating them, it removes the partially created database, SQLite sidecars, storage root, secret and receipt instead of leaving an ambiguous half-prepared runtime.

The preparation receipt explicitly records:

```text
providerCallsExecuted: false
providerSecretsStored: false
providerRankingProduced: false
legalTruthVerified: false
candidateAutoActivationApplied: false
```

## Runtime secret binding

The generated `MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH` file binds the authenticated worker/lease to the same `pilotId`, `approvalRef`, database, storage root and plan path. It contains the worker credential and lease token and must be treated as a secret.

The live runner accepts this one prepared secret path and verifies that its `pilotId` and `approvalRef` still match the frozen plan before provider execution. This replaces the need to expose four worker/lease secret variables individually.

The old explicit environment variables remain supported for backward compatibility:

```text
MARKORBIT_ADK_LIVE_DB_PATH
MARKORBIT_ADK_LIVE_STORAGE_ROOT
MARKORBIT_ADK_LIVE_PLAN_PATH
MARKORBIT_ADK_LIVE_WORKER_ID
MARKORBIT_ADK_LIVE_WORKER_CREDENTIAL
MARKORBIT_ADK_LIVE_LEASE_ID
MARKORBIT_ADK_LIVE_LEASE_TOKEN
```

## Provider credentials

Provider credentials are still read only from runtime environment variables:

```text
DEEPSEEK_API_KEY
OPENAI_API_KEY
```

Do not place either credential in:

- the frozen plan JSON;
- the prepared runtime-secret file;
- KnowledgeAssignment prompts;
- preparation or acceptance receipts;
- GitHub issues or PR comments;
- command-line arguments;
- RawArtifact metadata;
- logs.

A missing provider credential is not success. The ADK-06 runner records it as `BLOCKED_CREDENTIAL`, and the live harness refuses to produce an accepted record.

## Phase 2: preflight before paid provider execution

Before exposing provider credentials or starting the run, verify all of the following:

- the frozen plan is the same file used during preparation and has not been edited;
- the non-secret preparation receipt has `providerCallsExecuted: false` and the expected three Assignment ids;
- the runtime-secret file is private and has not been copied into the repository, logs or issue comments;
- both provider credentials are available only in the runtime environment;
- `MARKORBIT_ADK_LIVE_RECEIPT_PATH`, when used, points to a path that does not already exist;
- the operator records the exact repository commit used for the live run outside the secret-bearing environment.

A failed preflight is a blocked run, not permission to create replacement Assignments, relax the provider set, regenerate approval, or bypass the authenticated RawArtifact lifecycle.

## Phase 3: execute the real 3×2 pilot

With the prepared runtime secret and both provider credentials present:

```text
MARKORBIT_ADK_LIVE_RUNTIME_SECRET_PATH
DEEPSEEK_API_KEY
OPENAI_API_KEY
```

Optional:

```text
MARKORBIT_ADK_LIVE_RECEIPT_PATH
```

Run from repository root:

```bash
pnpm --filter @markorbit/worker adk:pilot:live
```

The live harness performs these steps in order:

1. loads the prepared runtime secret and the frozen plan;
2. verifies runtime-secret `pilotId` and `approvalRef` match the frozen plan;
3. requires the provider set to be exactly `DEEPSEEK` + `OPENAI`;
4. loads all three immutable KnowledgeAssignments from SQLite;
5. instantiates the real DeepSeek and OpenAI adapters using runtime-only provider credentials;
6. executes all six Assignment/provider cells;
7. fails closed unless all six cells are `EXECUTED`;
8. ingests each exact provider JSON as a RawArtifact using the prepared worker/lease boundary;
9. ingests each Markdown derivative only after its provider JSON is durable;
10. preserves Markdown `parentArtifactIds` lineage to the raw provider response;
11. requires six unique receipt-to-lineage matches;
12. emits one `AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD` to stdout and, optionally, an exclusive receipt file.

If execution stops before acceptance, diagnostic output may include the Assignment id, provider, cell status and stable error code. It must not include provider keys, worker credentials, lease tokens, prompt bodies, raw provider responses or distilled Markdown content.

## Accepted record minimum evidence

A valid accepted record contains:

- frozen `pilotId`;
- `approvalRef`;
- run id;
- exact three Assignment ids;
- exact provider set;
- six `EXECUTED` receipt views;
- six submission ids;
- six distilled artifact ids;
- six raw provider RawArtifact ids;
- six Markdown RawArtifact ids;
- permanent boundary flags showing no provider ranking, no legal-truth verification and no candidate auto-activation.

## Non-acceptance conditions

Do not close issue #405 if any of these are true:

- the plan lacks explicit live-provider authorization;
- any cell is `BLOCKED_CREDENTIAL`, `BLOCKED_ADAPTER` or `FAILED`;
- fewer than six acquisitions were returned;
- fewer than six RawArtifact lineage pairs were created;
- any receipt cannot be matched to its submission lineage;
- deterministic/fake transports were used instead of real provider endpoints;
- provider secrets or worker/lease secrets were persisted outside their intended private runtime boundary or logged;
- the plan or Assignment was created or modified after the run began.

Repository CI proves implementation behavior and preparation safety only. CI does not count as live external-provider evidence.
