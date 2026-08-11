# K-EXT-B — Local Folder Worker production ingestion

- **Direction:** horizontal Knowledge ingestion extension
- **Base:** `883acbc4b377a2c423941f9c4e1c94a3da415309` (merged K-EXT-A)
- **Status:** `IMPLEMENTING`
- **Owner:** Knowledge Worker / existing control plane

## Objective

Add a real `LOCAL_FOLDER` Worker without introducing a second ingestion architecture.

## Runtime path

```text
explicit Worker-host root binding
-> LOCAL_FOLDER SourceDefinition
-> existing CollectionPlan
-> existing CollectionRun / LOCAL_FILE_SCAN Job
-> existing Worker heartbeat + lease
-> existing controlled execution
-> existing ArtifactIngestionSession
-> existing hash/size verification + CAS
-> immutable RawArtifact
-> existing derived extraction / conversion handoff
-> existing execution receipt
```

## Safety and ownership

- absolute filesystem roots exist only in Worker-host configuration;
- SourceDefinition refers to a `rootBindingId`, never an authoritative arbitrary absolute path;
- path traversal and absolute relative paths fail closed;
- symlink files/directories are never followed;
- discovered real paths must remain within both the bound root and selected source folder;
- hidden/unsupported/zero-byte/oversized files are skipped;
- CollectionPlan include/exclude/maxItems are honored;
- hard ceiling is 100 files per Job and 25 MiB per file;
- Worker performs no direct SQLite access;
- Worker performs no direct Staging/Vault/retrieval/change-feed writes;
- immutable RawArtifact finalization remains the acquisition evidence boundary.

## Restart/replay

The Worker records a host-local private checkpoint before execution. It retains exact file SHA-256/size fingerprints, lease evidence and finalized artifact receipt IDs. On restart it re-verifies the files and reuses deterministic protocol idempotency keys. Changed checkpoint files fail closed.

## Required verification

- scanner containment/traversal tests;
- symlink non-following tests;
- include/exclude/batch bound tests;
- size bound tests;
- root binding configuration tests;
- private checkpoint round-trip;
- restart replay without duplicate byte upload in the protocol harness;
- restart changed-file fail closed;
- Python compile/test gate;
- repository format/lint/typecheck/test/build regression gates.

## Non-goals

- Email Worker;
- Local Folder scheduler redesign;
- new RawArtifact storage architecture;
- direct database import;
- automatic Staging/Vault publication;
- ReadyPackage protocol change;
- main-repository V2 consumer work.

## Next

After Owner merge only, continue with the next Knowledge horizontal ingestion work package; do not bypass the active roadmap order.
