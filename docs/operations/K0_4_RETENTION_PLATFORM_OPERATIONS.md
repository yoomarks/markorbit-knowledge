# K0-4 Retention, Acquisition Lifecycle and Storage Operations

## Purpose

This runbook defines the bounded operational model introduced by Knowledge K0-4 (#760). It keeps SQLite as the active store while making retention, large URL acquisition, platform operations, backup/restore, and migration review explicit and auditable.

## Non-negotiable safety rules

- Retention is `DRY_RUN` or explicit `APPLY`; there is no implicit destructive sweep.
- Governed evidence is archived, not physically deleted, when a Workspace retention policy expires.
- Protection holds fail closed for active conversion/staging lineage, ReadyPackages, current retrieval, and Evidence Sets.
- Scan, hold evaluation, apply, and retention audit execute under one `BEGIN IMMEDIATE` transaction.
- URL inventory is pruned from the active frontier only after `ACTIVE -> CLOSED -> ARCHIVED`, and each row is first persisted to `web_url_catalog_history`.
- Platform administration is read-only. It exposes durable facts; it does not synthesize legal conclusions or mutation guidance.
- Storage envelope escalation never authorizes a PostgreSQL migration. `MIGRATION_REVIEW_REQUIRED` means review the evidence and decide separately.

## Retention execution

Workspace `retentionPolicy.rawArtifactDays` and `derivedDocumentDays` are executable through `executeRetentionPolicy`. Use a bounded dry-run first and inspect every candidate plus `holdReasons`. An apply run may archive only candidates with no holds. Every run, including dry-runs, writes `retention_execution_audits`.

Retention archive is deliberately reversible at the evidence-record level. RawArtifact and Staging rows remain present with `ARCHIVED` status; retention does not delete content needed by active lineage, Evidence Sets, ReadyPackages, current retrieval, or audit evidence.

## Web URL campaign lifecycle

A catalog scope is `(workspaceId, campaignId, sourceKey)`. Discovery automatically establishes `ACTIVE`. A campaign cannot close while queued URLs remain in flight. `CLOSED` stops the frontier from accepting new work. `ARCHIVED` makes remaining candidates cold/non-eligible. `pruneArchived` is bounded to 1..5000 rows per call and moves rows to immutable history before deleting them from the active frontier.

Historical rows are not collection candidates. This keeps the operational frontier small without erasing discovery inventory or evidence lineage.

## Platform operations portfolio

The control-plane platform administration owner now exposes an `AVAILABLE`, read-only portfolio containing Workspace/source/run status, lease state, job backlog/failure counts, ReadyPackage/current retrieval counts, latest retention execution, active/historical URL inventory, campaign lifecycle counts, SQLite page/free-page/WAL facts, and the Storage Operating Envelope assessment. Operators should use this view instead of ad-hoc SQLite inspection for normal platform status.

## Storage Operating Envelope v1

| Signal              |    Attention | Migration review |
| ------------------- | -----------: | ---------------: |
| Active SQLite DB    |        4 GiB |            8 GiB |
| WAL                 |      256 MiB |            1 GiB |
| Free-page ratio     |          25% |              n/a |
| Active URL frontier | 250,000 rows |   1,000,000 rows |
| Backup age          |        >24 h |              n/a |
| Restore drill age   |        >30 d |              n/a |
| Restore throughput  |    <20 MiB/s |              n/a |

Attention is an operating signal, not a failure. Missing backup age, restore-drill age, or restore-throughput evidence is itself an `ATTENTION` reason so unknown recovery posture cannot be reported as healthy. Migration review is also not migration authorization; `migrationAuthorized` is always `false` in this contract.

## 800k URL benchmark evidence

Measured on 2026-09-17 with `node scripts/knowledge-storage-envelope-benchmark.mjs --rows 800000`; durable output is stored at `docs/operations/evidence/K0_4_STORAGE_BENCHMARK_2026-09-17.json`.

| Measurement                      |                 Result |
| -------------------------------- | ---------------------: |
| Rows                             |                800,000 |
| Insert duration                  |                4.254 s |
| Insert throughput                |         188,060 rows/s |
| SQLite DB bytes                  | 297,775,104 (~284 MiB) |
| WAL before checkpoint            | 299,548,752 (~286 MiB) |
| Backup copy                      |                0.061 s |
| Restore + integrity verification |                2.627 s |
| Restore throughput               |           108.12 MiB/s |
| Integrity check                  |                   `ok` |
| Restored rows                    |                800,000 |

At the target 800k URL scale SQLite remains operationally viable: database size and restore throughput are well inside the envelope. The active frontier and WAL cross attention thresholds, so operators should use campaign closeout/prune and WAL checkpoint discipline. This benchmark does **not** justify an automatic PostgreSQL migration.

## Backup, restore and reconciliation

Use the existing `KNOWLEDGE_V0_1_BACKUP_RESTORE.md` procedure and `pnpm release:backup-restore-drill`. Before a cold backup, checkpoint WAL and validate source integrity. After restore, verify `PRAGMA integrity_check`, expected governed records, URL history, retention audit evidence, and normal reconciliation behavior.

K0-4 includes a file-backed regression that performs retention plus URL lifecycle compaction, cold copy/restore, and then checks archived RawArtifact state, historical URL rows, retention audits, campaign state, integrity, and reconciliation.

## Operator cadence

- Run retention in `DRY_RUN` before `APPLY`; keep batches bounded.
- Close/archive campaigns when a bulk acquisition wave is complete; prune archived frontier in bounded batches.
- Watch `storage.envelope.reasonCodes` and backlog/failure counts in the platform portfolio.
- Keep a backup no older than 24 hours and perform a restore drill at least every 30 days.
- Rerun the 800k benchmark after material schema/index changes or before changing migration-review thresholds.
- Treat PostgreSQL as a separately approved migration project only after repeated envelope evidence shows SQLite no longer meets the operating target.
