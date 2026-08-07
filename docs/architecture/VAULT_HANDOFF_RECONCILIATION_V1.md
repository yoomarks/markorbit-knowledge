# Vault Handoff Reconciliation & Inspection v1

## Purpose

Provide a strictly read-only operational view over the local Ready Package → Obsidian Vault handoff introduced by TASK-029.

## Inputs

- verified Evidence Bundle root;
- verified `ready-package.json` and handoff registry;
- configured local Vault root;
- append-only `.markorbit/ready-package-consumption.jsonl` receipt registry;
- expected Vault target below the controlled Inbox prefix.

## States

- `PENDING`: Ready Package is valid, no matching receipt exists, and the target is absent.
- `CONSUMED`: exactly one matching receipt exists and the target is a regular file whose SHA-256 matches the Ready Package.
- `DRIFTED`: prior or partial consumption evidence exists, but the target is missing, changed, or present without a receipt.
- `INVALID`: Ready Package verification, target-path safety, receipt parsing, uniqueness, or binding is invalid.

## Stable reasons

`AWAITING_CONSUMPTION`, `HANDOFF_VERIFIED`, `TARGET_MISSING_AFTER_RECEIPT`, `TARGET_DIGEST_DRIFT`, `TARGET_PRESENT_WITHOUT_RECEIPT`, `READY_PACKAGE_INVALID`, `TARGET_PATH_INVALID`, `TARGET_FILE_INVALID`, `RECEIPT_FILE_INVALID`, `RECEIPT_PARSE_FAILED`, `RECEIPT_DUPLICATE`, and `RECEIPT_BINDING_INVALID`.

## Command

```bash
pnpm --filter @markorbit/integration-tests inspect:vault-handoff \
  --root ./tmp/manual-run \
  --vault ./my-vault
```

The command exits with code `0` for `PENDING` and `CONSUMED`, `2` for `INVALID`, and `3` for `DRIFTED`.

## Authority boundary

Inspection never creates directories, writes files, appends receipts, consumes packages, repairs drift, changes ConversionRun or Staging state, or invokes Obsidian APIs, AI, or MarkOrbit Core.
