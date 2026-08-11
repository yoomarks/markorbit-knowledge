# Obsidian Vault Binding V1

## Purpose

Vault Binding V1 establishes the Workspace-scoped authorization and directory-mapping boundary that future Obsidian export/import operations must use.

It does **not** make Obsidian a source of semantic truth and does not move MarkOrbit Core behavior into Knowledge.

## Boundary

```text
server-controlled MARKORBIT_OBSIDIAN_VAULT_ROOT
  +
Workspace VaultBinding.relativeRoot
  ↓
future Vault Export / Import runtime
```

The server filesystem root is deployment configuration. It is never persisted in `VaultBindingV1` and is never returned by the browser API.

A binding stores only a portable relative directory below that root.

## Contract

`VaultBindingV1` contains:

- `contractVersion = 1.0`
- `objectType = VAULT_BINDING`
- stable `vlt_*` binding ID
- Knowledge `workspaceId`
- operator-facing name
- `adapter = LOCAL_FILESYSTEM`
- portable `relativeRoot`
- `status = ACTIVE | DISABLED`
- optimistic `revision`
- timestamps

One Workspace has at most one binding in V1.

## Path policy

`relativeRoot` is deliberately stricter than a generic operating-system path.

V1 rejects:

- absolute paths;
- `.` and `..` segments;
- backslashes;
- empty path segments;
- NUL/control-path tricks;
- Windows reserved device names;
- segments ending in a dot or space;
- non-portable segment syntax.

The goal is a deterministic directory mapping that can be used on Windows, macOS and Linux without granting an admin browser arbitrary server filesystem traversal.

## Deployment readiness

The admin API exposes only:

```ts
{
  configured: boolean;
  issueCode: string | null;
}
```

for `MARKORBIT_OBSIDIAN_VAULT_ROOT`.

The absolute root value itself is not returned.

V1 requires the configured root to be absolute. A binding may be persisted while the server root is unavailable, but future filesystem execution must fail closed until readiness is restored.

## Concurrency

Binding mutation uses optimistic revisions:

- create starts at revision `1`;
- existing configuration changes require the current revision;
- status transitions require the current revision;
- stale writes fail with `VAULT_BINDING_REVISION_CONFLICT`;
- exact no-op replay does not advance the revision.

## Existing projection utility

`LocalObsidianVaultProjectionRepository` already provides a controlled READY-Staging Markdown projection primitive with symlink and traversal protections.

R1-K06 does not silently wire that primitive to the new binding. A later explicit Vault Export milestone must consume `VaultBindingV1`, re-check server-root readiness, persist a sync/export ledger, and preserve explicit operator authority.

## Non-goals

R1-K06 does not implement:

- automatic export;
- automatic import;
- directory scanning;
- Wiki Link parsing;
- YAML round-trip validation;
- Git integration;
- conflict resolution;
- sync scheduling or retry;
- semantic analysis or AI behavior;
- MarkOrbit Core behavior.
