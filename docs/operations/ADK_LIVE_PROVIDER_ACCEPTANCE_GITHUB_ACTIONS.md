# ADK-06 GitHub Live Provider Acceptance

Status: operational path for issue #405. A successful run is real external-provider evidence; a normal PR/CI run is not.

## Purpose

`.github/workflows/adk-live-provider-acceptance.yml` provides a manual, fail-closed execution path for the frozen 3×2 ADK-06 acceptance. It deliberately does not run on push or pull request events.

The workflow fixes the three governed US Trademark assignments to:

- `kas_us_trademark_filing`
- `kas_us_trademark_section_8`
- `kas_us_trademark_ttab`

and fixes provider order to:

- `DEEPSEEK`
- `OPENAI`

## Required repository secrets

Configure these GitHub Actions repository secrets before dispatching the workflow:

```text
DEEPSEEK_API_KEY
OPENAI_API_KEY
```

Never put either value in workflow inputs, issue comments, PR comments, plan JSON, artifacts, or command-line arguments.

The workflow checks only whether each secret is present. It never prints either secret.

## Manual authorization inputs

The workflow requires both:

- `approval_ref`: a non-empty explicit authorization reference for the specific real-provider run;
- `confirm_live_provider_calls`: boolean `true`.

The workflow is intended to be dispatched from `main`. The selected commit SHA is preserved in the non-secret workflow evidence record.

A generic CI run, a preparation-only run, or a workflow invocation without explicit live-provider authorization does not satisfy issue #405.

## Execution sequence

The workflow performs these steps:

1. checks out the selected commit and installs the frozen workspace;
2. fails closed unless both provider secrets and an approval reference exist;
3. creates a fresh `AiProductionPilotPlanV1` containing exactly the three frozen assignments and the two frozen providers;
4. runs `adk:pilot:prepare` to create the authenticated SQLite/RawArtifact runtime and private Worker/Lease secret file;
5. runs `adk:pilot:live` with the real DeepSeek and OpenAI adapters;
6. requires six of six cells to be `EXECUTED`;
7. requires six RawArtifact lineage records and twelve unique finalized RawArtifact receipts;
8. requires the authenticated execution attempt to complete;
9. deletes the transient Worker/Lease runtime-secret file before evidence upload;
10. uploads the durable acceptance evidence as a private GitHub Actions artifact with 30-day retention.

## Durable evidence artifact

A successful workflow run uploads:

```text
plan.json
preparation-receipt.json
acceptance.json
workflow-metadata.json
live.sqlite
artifacts/**
```

It intentionally does **not** upload `runtime-secret.json`.

`workflow-metadata.json` records the repository, exact commit SHA, Actions run id/attempt, issue number, pilot id, approval reference, frozen assignments/providers, executed cell count, RawArtifact lineage count, finalized artifact receipt count, execution attempt id, and accepted state.

The content-addressed `artifacts/**` tree plus `live.sqlite` preserve the exact provider JSON and Markdown derivative evidence needed to audit the RawArtifact lineage after the ephemeral runner is destroyed.

## Acceptance boundary

Do not close issue #405 unless the actual manual workflow run succeeds and the uploaded evidence confirms:

- exactly six `EXECUTED` provider cells;
- exactly six acquisition/lineage records;
- exactly twelve finalized RawArtifact receipts;
- authenticated execution state `COMPLETED`;
- no provider ranking;
- no legal-truth verification;
- no candidate auto-activation.

If either provider secret is absent/invalid, a provider request fails, evidence is incomplete, or the runtime cannot complete its authenticated artifact-backed execution, the workflow must fail and issue #405 remains open.
