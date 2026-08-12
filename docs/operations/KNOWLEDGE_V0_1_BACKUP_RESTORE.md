# MarkOrbit Knowledge v0.1 Backup and Restore

This runbook defines the supported backup boundary for the current local/self-hosted MarkOrbit Knowledge v0.1 deployment model.

It intentionally specifies a **quiesced/cold backup**. It does not claim online/hot-backup or clustered failover guarantees for the SQLite reference adapter.

## Protected state

A recoverable Knowledge snapshot consists of coordinated copies of the following state.

| State                         | Default when not overridden        | Configuration                   |
| ----------------------------- | ---------------------------------- | ------------------------------- |
| SQLite control-plane database | `.data/markorbit-knowledge.sqlite` | `MARKORBIT_KNOWLEDGE_DB_PATH`   |
| RawArtifact CAS               | `.data/artifacts`                  | `MARKORBIT_ARTIFACT_STORE_PATH` |
| Staging CAS                   | `.data/staging`                    | `MARKORBIT_STAGING_STORE_PATH`  |
| Obsidian / Vault files        | deployment-specific                | `MARKORBIT_OBSIDIAN_VAULT_ROOT` |

The database contains registry, execution, Worker, conversion, scheduler, Vault evidence, ReadyPackage and delivery/reconciliation state. The CAS directories contain immutable bytes referenced by that metadata. A database-only backup is therefore not a complete Knowledge backup.

Vault files are operationally separate from Knowledge CAS. Include them only when the recovery objective requires restoration of the reviewed/editable Vault working copy as well.

## Before backup

1. Open Operations Readiness for the target Workspace.
2. Resolve or explicitly record any `BLOCKED` conditions before taking a release/upgrade backup.
3. Drain or disable long-running Workers when practical.
4. Wait for in-flight collection and conversion work to reach a durable boundary. Do not manufacture success for an active lease merely to make the dashboard green.
5. Stop external collection/conversion Workers.
6. Stop the Admin/control-plane process so no process can write the SQLite database or CAS during the copy.

The important property is **no writers during the filesystem snapshot**.

## Backup procedure

### 1. Record the effective paths

Record the deployment's effective values for:

- `MARKORBIT_KNOWLEDGE_DB_PATH`;
- `MARKORBIT_ARTIFACT_STORE_PATH`;
- `MARKORBIT_STAGING_STORE_PATH`;
- `MARKORBIT_OBSIDIAN_VAULT_ROOT`, when Vault recovery is in scope;
- repository/application revision being backed up.

If the first three are unset, the defaults are under the repository root as shown in the table above.

Do not record Worker credentials, Core internal secrets, IMAP passwords, proxy credentials or other secret values in the backup manifest.

### 2. Copy SQLite as one state set

After the control plane has stopped, copy:

- the main `.sqlite` file;
- a matching `-wal` file if one still exists;
- a matching `-shm` file if one still exists.

Treat these files as a unit. **Never copy only the main database file while writers are active.** A live WAL may contain committed state that has not yet been checkpointed into the main database file.

### 3. Copy both content stores

Copy the complete RawArtifact CAS and Staging CAS directory trees without rewriting names or contents.

Do not deduplicate, normalize, re-encode or regenerate content during backup. Their stored byte identity is part of the evidence chain.

### 4. Copy Vault separately when required

If the recovery objective includes Vault working files, copy the configured Vault root separately. Vault is not a substitute for the Staging CAS, and the Staging CAS is not a substitute for the Vault working copy.

### 5. Create a non-secret manifest

For each snapshot record:

- snapshot timestamp in UTC;
- repository commit/tag;
- effective database/CAS/Vault paths;
- copied file/directory names;
- total byte counts where practical;
- storage-level checksum or snapshot identifier when the backup system provides one.

Keep secret values out of this manifest.

## Restore procedure

Restore into an isolated location first whenever possible.

1. Stop all Knowledge Admin/control-plane and Worker processes that could touch the restore target.
2. Restore the SQLite file set to the configured database location.
3. Restore the RawArtifact CAS to the configured artifact-store location.
4. Restore the Staging CAS to the configured staging-store location.
5. Restore Vault files only if they are part of the selected recovery point.
6. Start the control plane before external Workers.
7. Let normal startup migration/registry initialization run against the restored database.
8. Open Operations Readiness and inspect current durable state.
9. Start Workers only after the control plane is healthy enough to accept heartbeats/claims.
10. Reconcile interrupted work using existing lease/recovery semantics. Do **not** manually rewrite terminal rows or ReadyPackage delivery evidence.

## Restore verification

A restore is not complete merely because the application starts.

Verify at minimum:

- the expected Workspace exists;
- Source, Connector and CollectionPlan records are visible;
- RawArtifact metadata can resolve its referenced CAS bytes;
- representative artifact size and SHA-256 checks still match;
- representative Staging documents resolve their immutable bytes;
- Worker definitions are present but no stale credential is printed or recovered from the database/UI;
- Scheduler state is readable and does not silently replay an already-materialized slot;
- ReadyPackage V2 delivery reconciliation produces a legal diagnosis from the restored evidence;
- the Operations Readiness page contains no unexplained `BLOCKED` condition.

If V2 delivery was in an unknown-outcome state at backup time, preserve that state. Recovery must use the existing exact frozen-request semantics; restoring from backup does not authorize generation of a new request or a V2-to-V1 fallback.

## Upgrade rollback rule

Before any migration-bearing production upgrade, take a verified backup using this runbook.

If rollback is required after a migration has committed, do not point older code at a database whose schema it does not understand. Restore the coordinated pre-upgrade database + CAS snapshot instead, then start the older application revision against that restored state.

## What this runbook does not promise

v0.1 does not claim:

- online SQLite backup while writers continue;
- zero-downtime database failover;
- multi-node shared-filesystem consistency;
- automatic off-site retention;
- automatic secret-manager backup;
- automatic Vault conflict merge;
- restoration of external systems such as MarkOrbit Core, an IMAP server, a source website or an egress proxy.

Those are deployment/topology concerns and should be added only when the real deployment requires them.
