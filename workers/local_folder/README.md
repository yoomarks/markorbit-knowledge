# Local Folder Worker

`workers/local_folder/local_folder_worker.py` is the production `LOCAL_FOLDER` acquisition Worker for MarkOrbit Knowledge.

It is intentionally a Worker Protocol client, not an alternate import path. The Worker never opens the Knowledge SQLite database and never writes Staging, Vault, retrieval or change-feed state directly.

## Governed path

```text
LOCAL_FOLDER SourceDefinition
-> manual/scheduled CollectionPlan
-> CollectionRun + LOCAL_FILE_SCAN Job
-> Worker heartbeat + lease claim
-> controlled execution START / UPLOADING
-> ArtifactIngestionSession per file
-> streamed bytes + SHA-256/size verification
-> immutable CAS RawArtifact finalization
-> derived source-graph/conversion handoff
-> VERIFYING / artifact-backed execution receipt / COMPLETE
```

## Root binding

Absolute local filesystem roots are configured only on the Worker host:

```bash
export MARKORBIT_LOCAL_FOLDER_ROOTS_JSON='{"legal":"/srv/knowledge/legal","research":"/srv/knowledge/research"}'
```

A `LOCAL_FOLDER` SourceDefinition references only a binding ID and an optional relative path:

```json
{
  "sourceType": "LOCAL_FOLDER",
  "connector": { "connectorId": "local-folder", "version": "1.0.0" },
  "connectorConfig": {
    "rootBindingId": "legal",
    "relativePath": "trademarks",
    "recursive": true
  }
}
```

The source cannot provide an absolute Worker path. Parent traversal and absolute relative paths are rejected. Symlink directories and files are never followed.

## Production connector

Register `LOCAL_FOLDER_PRODUCTION_CONNECTOR_MANIFEST_INPUT` from:

`apps/admin/src/server/local-folder-production-connector.ts`

through the existing Connector Registry before creating the source. The manifest is restricted to:

- `LOCAL_FOLDER`;
- `LOCAL_FILE_SCAN`;
- `COLLECT`;
- bounded document artifact kinds;
- Python Worker runtime.

## Worker credentials

Provision a normal Worker Definition through the existing Worker Registry with:

- `supportedJobTypes: ["LOCAL_FILE_SCAN"]`;
- connector binding `local-folder@1.0.0` / `COLLECT`;
- runtime ID appropriate to the host.

Keep the returned credential only on that Worker host.

Required environment:

```bash
export MARKORBIT_KNOWLEDGE_URL='http://127.0.0.1:3000'
export MARKORBIT_WORKER_ID='wrk_...'
export MARKORBIT_WORKER_CREDENTIAL='mwk_...'
export MARKORBIT_LOCAL_FOLDER_ROOTS_JSON='{"legal":"/srv/knowledge/legal"}'
```

Optional:

```bash
export MARKORBIT_LOCAL_FOLDER_STATE_PATH='/var/lib/markorbit/local-folder-state.json'
export MARKORBIT_LOCAL_FOLDER_MAX_FILE_BYTES='26214400'
```

Run one claim:

```bash
python workers/local_folder/local_folder_worker.py --once
```

Run continuously:

```bash
python workers/local_folder/local_folder_worker.py --poll-seconds 5
```

## File policy

Hard ceiling: 100 files per Job and 25 MiB per file. The CollectionPlan `maxItems` may lower the batch ceiling. Include/exclude patterns apply to paths relative to the selected source folder.

Supported kinds:

- Markdown
- TXT
- PDF
- DOCX
- XLSX
- CSV
- JSON
- XML

Hidden files, unsupported extensions, symlinks, zero-byte files and files over the configured bound are skipped.

## Restart / replay

Before execution, the Worker persists a private local checkpoint containing the lease token, immutable Job snapshot reference, discovered file fingerprints and finalized artifact receipt IDs. The checkpoint is written with mode `0600` where supported.

On restart while the lease remains valid, the Worker:

1. verifies every checkpointed file still matches its exact SHA-256 and size;
2. reuses deterministic execution and artifact-session idempotency keys;
3. replays finalized sessions rather than uploading duplicate RawArtifacts;
4. completes the same execution receipt;
5. removes the checkpoint only after `COMPLETE` succeeds.

If a checkpointed file changes, the Worker fails closed rather than silently changing the evidence set.
