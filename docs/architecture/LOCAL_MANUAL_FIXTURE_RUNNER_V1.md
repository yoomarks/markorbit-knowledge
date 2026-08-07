# Local Manual Fixture Pipeline Runner v1

TASK-025 adds an explicitly invoked developer/acceptance runner for one bounded UTF-8 text file.

## Command

```bash
pnpm --filter @markorbit/integration-tests manual:fixture \
  --input ./sample.txt \
  --output-dir ./tmp/manual-run \
  --execution-key sample-run
```

`--input` and `--output-dir` are required. The output directory must not already contain `knowledge.sqlite`. The optional execution key is bounded to the same safe character subset used by the controlled fixture pipeline.

## Execution boundary

The runner assembles the real local control-plane components and performs:

1. local Source and manual CollectionPlan creation;
2. authenticated local collection Worker execution;
3. bounded RawArtifact ingestion as `TEXT` / `text/plain`;
4. active `builtin-text-markdown@1.0.0` ConversionProfile creation;
5. ConversionRun dispatch and capability-bound claim;
6. authenticated STARTED, progress and output-ready reports;
7. immutable Staging CAS ingest;
8. built-in Staging verification;
9. verifier-owned finalization;
10. terminal Inspection Projection readback.

No repository state machine is duplicated in the runner.

## Preserved evidence

The explicit output directory is retained after the command exits and contains:

- `knowledge.sqlite`;
- local RawArtifact storage;
- immutable Staging CAS content.

The command never overwrites a directory that already contains `knowledge.sqlite`.

## JSON output

Standard output contains a stable summary of:

- terminal status and observed phase;
- ConversionRun and Staging document IDs;
- verification outcome;
- input filename, byte count and SHA-256;
- database, CAS and Staging target paths;
- output byte count and SHA-256.

The summary intentionally excludes Worker credentials, lease bearer material, token references and token digests.

## Failure behavior

Argument, file, size and output-directory errors use stable `MANUAL_FIXTURE_*` codes. The runner executes once and exits. It does not retry, poll, schedule or continue as a daemon.

## Non-goals

This is not a production ingestion API. It adds no HTTP server, scheduler, polling loop, automatic retry, production object storage, Obsidian adapter, Ready Package publishing, AI extraction, semantic analysis or MarkOrbit Core behavior.
