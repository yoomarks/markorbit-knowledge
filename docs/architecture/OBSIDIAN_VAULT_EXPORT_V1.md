# Obsidian Vault Export V1

## Purpose

Vault Export V1 adds the first real, operator-triggered filesystem delivery boundary from verified Knowledge Staging into a Workspace-bound local Obsidian Vault.

It consumes:

- an `ACTIVE` `VaultBindingV1`;
- the server-only `MARKORBIT_OBSIDIAN_VAULT_ROOT` configuration;
- a verified `READY` Staging document;
- the existing controlled local projection primitive.

It does not make the Vault authoritative over Knowledge evidence and does not move semantic understanding into Knowledge.

## Explicit authority

Export is never automatic in V1.

```text
Operator selects READY Staging
  ↓
POST /api/workspaces/:id/vault-exports
  ↓
Durable PENDING VaultExportRunV1
  ↓
Controlled filesystem inspection / projection
  ↓
Persist projection receipt
  ↓
SUCCEEDED
```

No scheduler, watcher, background retry or implicit "sync all" operation is introduced.

## Frozen run

`VaultExportRunV1` freezes the exact delivery identity before filesystem work:

- Knowledge Workspace ID;
- deterministic idempotency key;
- SHA-256 fingerprint of the resolved server Vault root path;
- Vault binding ID, revision and relative root;
- Staging document ID, immutable content SHA-256 and target path;
- preparation timestamp.

The absolute server filesystem path is **not** persisted. Only its fingerprint is retained so an unresolved run cannot silently resume against a different deployment root.

## State model

V1 deliberately uses only:

```text
PENDING → SUCCEEDED
```

`PENDING` means the control plane has durably recorded the exact request but has not yet durably confirmed terminal success.

It does **not** mean the file is definitely absent. A process may terminate after an atomic filesystem rename and before the projection receipt is persisted.

V1 therefore does not invent a FAILED terminal state for uncertain filesystem outcomes.

## Crash / retry semantics

### Before filesystem write

The run already exists as `PENDING`. A retry reuses the same frozen root fingerprint, binding snapshot, Staging identity and target path.

### File written, process terminates before receipt

The next explicit retry first performs a read-only inspection of the frozen destination.

If the exact expected bytes are already present, the system records:

```text
disposition = ALREADY_PRESENT
```

and finalizes the original run without writing again.

### Projection receipt persisted, finalization interrupted

The next retry finalizes locally from the persisted receipt. Current Vault root configuration and current binding state are not required because the filesystem result has already been durably recorded.

This mirrors the repository's existing "persist transport result before local acknowledgement" reliability rule at a local-filesystem boundary.

## Binding changes while PENDING

If an unresolved run has no projection receipt:

- exact existing expected content may still be reconciled read-only;
- a missing target may only be written when the current binding is still `ACTIVE` and exactly matches the frozen binding ID, revision and relative root;
- a changed or disabled binding therefore cannot authorize a new write for an old pending run.

A new destination cannot replace an unresolved destination silently. The ledger allows at most one PENDING export for a Workspace + Staging document.

## Root changes while PENDING

The resolved server root is SHA-256 fingerprinted before the run is prepared.

If a retry sees a different root fingerprint and there is no persisted projection receipt, it fails closed with `VAULT_EXPORT_PENDING_ROOT_MISMATCH`.

This prevents a process restart or environment change from redirecting an unresolved export to another filesystem tree.

## Content conflicts

V1 never overwrites different existing Vault content.

Before writing, the target is inspected:

- `MISSING` → may write only with the frozen binding still current and ACTIVE;
- `MATCH` → record `ALREADY_PRESENT` and finalize;
- `CONFLICT` → remain PENDING and require operator resolution.

The projection primitive uses `FAIL_IF_DIFFERENT` for R1-K07.

This preserves manual reviewer edits until a later explicit conflict workflow exists.

## Path and symlink safety

The K06 portable `relativeRoot` policy remains mandatory.

The projection primitive additionally:

- supports a binding-relative root beneath the server root;
- validates target paths as relative Markdown paths;
- walks nested directories one segment at a time;
- rejects symlink or non-directory path components;
- rejects symlink or non-file final targets;
- verifies all resolved child paths remain beneath the controlled parent;
- writes through a temporary file followed by atomic rename.

## Receipt

A successful projection first persists a projection receipt containing:

- Vault-relative path;
- content SHA-256;
- `WRITTEN | ALREADY_PRESENT` disposition;
- receipt timestamp.

Only after that receipt exists does the run transition to `SUCCEEDED`.

The terminal result must exactly equal the persisted projection receipt.

## Admin API

```text
GET  /api/workspaces/:id/vault-exports
POST /api/workspaces/:id/vault-exports
```

GET returns:

- current binding state;
- filesystem readiness only, never the absolute root path;
- up to 50 READY Staging candidates;
- recent Vault export runs.

POST requires one explicit `stagingDocumentId`.

## Non-goals

R1-K07 does not implement:

- automatic export;
- import or Vault-to-Knowledge writes;
- directory scanning;
- YAML round-trip processing;
- Wiki Link parsing;
- Git synchronization;
- merge/conflict resolution;
- scheduling or background retry;
- semantic interpretation or AI;
- MarkOrbit Core behavior.

## Follow-up

The next Vault milestone should add a **read-only Vault inspection / import-candidate boundary** before any two-way synchronization is considered. It should preserve the same explicit authority, provenance and conflict-first rules rather than turning the Vault into an uncontrolled mutable source.
