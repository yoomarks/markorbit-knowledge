# Vault Handoff Inventory Snapshot & Delta v1

## Purpose

TASK-032 adds a manually invoked, local history layer over TASK-031. It freezes one complete Vault handoff inventory as an integrity-protected snapshot and compares two verified snapshots without consuming, repairing, or writing to the Vault.

## Snapshot contract

A snapshot uses `schemaVersion: 1.0.0` and `objectType: VAULT_HANDOFF_INVENTORY_SNAPSHOT`. Its evidence contains the generation time, runs root, Vault directory, aggregate status counts, and a deterministic `runKey ASC` item list. Absolute per-item run and Vault target paths are excluded.

The evidence is serialized as canonical JSON with lexicographically sorted object keys and protected by SHA-256. The snapshot is written through an exclusive temporary file and atomic rename. Existing output files are never overwritten.

## Verification

Readers fail closed on invalid JSON, invalid envelope fields, or digest mismatch. Snapshot comparison always verifies both inputs before producing a delta.

## Delta model

The comparison uses the stable union of both snapshots' `runKey` values and classifies each item as:

- `ADDED`
- `REMOVED`
- `UNCHANGED`
- `PROGRESSED` for `PENDING -> CONSUMED`
- `DRIFT_INTRODUCED` when the new state is `DRIFTED`
- `INVALID_INTRODUCED` when the new state is `INVALID`
- `RECOVERED` when `DRIFTED` or `INVALID` becomes `PENDING` or `CONSUMED`
- `CHANGED` for other status or reason transitions

The delta includes aggregate transition counts and a deterministic `runKey ASC` item list.

## Commands

```bash
pnpm --filter @markorbit/integration-tests snapshot:vault-handoffs -- \
  snapshot --runs-root ./tmp/runs --vault ./vault --output ./snapshots/current.json

pnpm --filter @markorbit/integration-tests diff:vault-handoff-snapshots -- \
  diff --before ./snapshots/previous.json --after ./snapshots/current.json
```

The diff command exits with code `2` when a new invalid state appears and `3` when new drift appears without a new invalid state.

## Explicit exclusions

TASK-032 does not add scheduling, polling, automatic history retention, Vault writes, Ready Package consumption, repair, HTTP APIs, Obsidian indexing, AI processing, semantic analysis, or MarkOrbit Core behavior.
