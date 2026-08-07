# Vault Handoff Inventory & Batch Inspection v1

TASK-031 adds a strictly read-only batch projection over multiple local Ready Package run directories.

## Scope

The inventory scans only immediate child directories below a configured runs root. Each child is treated as one candidate run and inspected through the existing TASK-030 `inspectVaultHandoff` authority boundary.

The inventory never consumes, repairs, rewrites, schedules or recursively discovers arbitrary files.

## Output

Each item includes a stable `runKey`, absolute run directory, TASK-030 status and reason evidence. Results are sorted by `runKey ASC`.

Aggregate counts cover:

- `PENDING`
- `CONSUMED`
- `DRIFTED`
- `INVALID`

A caller may filter by status and apply a bounded limit from 1 to 500. Counts always describe the complete scanned batch before filtering.

## Failure isolation

A malformed package, missing package, symlinked run directory or unexpected per-run inspection failure becomes:

```text
INVALID / BATCH_ITEM_INSPECTION_FAILED
```

The remaining candidates continue to be inspected.

## CLI

```bash
pnpm --filter @markorbit/integration-tests inventory:vault-handoffs \
  --runs-root ./tmp/runs \
  --vault ./my-vault \
  --status DRIFTED \
  --limit 100
```

Exit codes:

- `0`: no invalid or drifted items
- `2`: at least one invalid item
- `3`: at least one drifted item and no invalid items

## Exclusions

No Vault writes, automatic consumption, repair, deep recursive discovery, scheduler, HTTP API, Obsidian indexing, AI processing, semantic analysis or MarkOrbit Core behavior.
