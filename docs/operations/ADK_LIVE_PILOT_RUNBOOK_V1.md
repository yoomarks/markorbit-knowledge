# ADK Live Pilot Runbook V1

Status: **implementation runbook; live acceptance still requires real execution evidence**

This runbook executes the ADK-06 3-topic × 2-provider live acceptance with the merged DeepSeek and OpenAI production adapters.

## Boundary

The live harness does not compare provider quality, score answers, verify legal truth, or activate Assignment Candidates. It only executes frozen KnowledgeAssignments, preserves provider responses and Markdown derivatives, and emits auditable acquisition/RawArtifact lineage.

## Frozen plan requirement

The harness will not create a pilot plan on the fly. `MARKORBIT_ADK_LIVE_PLAN_PATH` must point to a pre-existing JSON document that satisfies `AiProductionPilotPlanV1` and contains:

- exactly three distinct durable `kas_*` KnowledgeAssignment ids;
- providers exactly in this frozen order: `DEEPSEEK`, `OPENAI`;
- an explicit `approvalRef`;
- `liveProviderCallsAuthorized: true`;
- all permanent authority-boundary flags set to false as required by the contract.

The three Assignment ids must already exist in the target Knowledge SQLite registry and must reference immutable InstructionSet revisions.

## Preflight

Before exposing provider credentials or starting the run, verify all of the following:

- the plan file already exists and will not be edited during execution;
- the three Assignment ids resolve from the exact SQLite database selected for the run;
- the worker identity and active lease belong to the intended Knowledge workspace/source scope;
- the content-addressed storage root is the storage root associated with that database/runtime;
- `MARKORBIT_ADK_LIVE_RECEIPT_PATH`, when used, points to a path that does not already exist;
- no provider key appears in the plan file, shell history, command arguments, issue comments or receipt path;
- the operator records the exact repository commit used for the live run outside the secret-bearing environment.

A failed preflight is a blocked run, not permission to create replacement Assignments, relax the provider set or bypass the authenticated RawArtifact lifecycle.

## Runtime secrets

Provider credentials are read only from runtime environment variables:

```text
DEEPSEEK_API_KEY
OPENAI_API_KEY
```

Do not place either credential in:

- the frozen plan JSON;
- KnowledgeAssignment prompts;
- receipt files;
- GitHub issues or PR comments;
- command-line arguments;
- RawArtifact metadata;
- logs.

A missing provider credential is not success. The ADK-06 runner records it as `BLOCKED_CREDENTIAL`, and the live harness refuses to produce an accepted record.

## Knowledge persistence / RawArtifact execution context

The live harness intentionally reuses the existing authenticated RawArtifact lifecycle. Before execution, provide a valid existing SQLite database, content-addressed storage root, worker identity and active job lease that belong to the intended Knowledge workspace/source scope.

Required environment variables:

```text
MARKORBIT_ADK_LIVE_DB_PATH
MARKORBIT_ADK_LIVE_STORAGE_ROOT
MARKORBIT_ADK_LIVE_PLAN_PATH
MARKORBIT_ADK_LIVE_WORKER_ID
MARKORBIT_ADK_LIVE_WORKER_CREDENTIAL
MARKORBIT_ADK_LIVE_LEASE_ID
MARKORBIT_ADK_LIVE_LEASE_TOKEN
```

Optional:

```text
MARKORBIT_ADK_LIVE_RECEIPT_PATH
```

When provided, the receipt path is created with exclusive-create semantics. An existing file is never overwritten.

## Execute

From repository root:

```bash
pnpm --filter @markorbit/worker adk:pilot:live
```

The harness performs these steps in order:

1. load and validate the frozen plan;
2. require the provider set to be exactly `DEEPSEEK` + `OPENAI`;
3. load all three immutable KnowledgeAssignments from SQLite;
4. instantiate the real DeepSeek and OpenAI adapters using runtime-only credentials;
5. execute all six Assignment/provider cells;
6. fail closed unless all six cells are `EXECUTED`;
7. ingest each exact provider JSON as a RawArtifact using the existing worker/lease boundary;
8. ingest each Markdown derivative only after its provider JSON is durable;
9. preserve Markdown `parentArtifactIds` lineage to the raw provider response;
10. require six unique receipt-to-lineage matches;
11. emit one `AI_PRODUCTION_PILOT_LIVE_ACCEPTANCE_RECORD` to stdout and, optionally, an exclusive receipt file.

If execution stops before acceptance, diagnostic output may include the Assignment id, provider, cell status and stable error code. It must not include provider keys, prompt bodies, raw provider responses or distilled Markdown content.

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

- any cell is `BLOCKED_CREDENTIAL`, `BLOCKED_ADAPTER` or `FAILED`;
- fewer than six acquisitions were returned;
- fewer than six RawArtifact lineage pairs were created;
- any receipt cannot be matched to its submission lineage;
- deterministic/fake transports were used instead of real provider endpoints;
- provider secrets were persisted or logged;
- the plan or Assignment was created or modified after the run began.

Repository CI proves only implementation behavior. CI does not count as live external-provider evidence.
