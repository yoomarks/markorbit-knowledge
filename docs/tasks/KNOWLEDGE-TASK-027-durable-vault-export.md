# KNOWLEDGE-TASK-027 — Durable Explicit Vault Export

## Goal

Turn the existing READY-Staging Obsidian projection primitive into an operator-authorized, Workspace-bound and crash-recoverable Vault export boundary.

## Scope

- consume only an ACTIVE `VaultBindingV1` for new writes;
- freeze binding revision, relative root, Staging content hash/target path and server-root fingerprint before filesystem work;
- persist `PENDING` before projection;
- inspect exact frozen destination on retry;
- persist projection receipt before terminal finalization;
- finalize locally from a persisted receipt;
- never overwrite different existing Vault content;
- expose explicit GET/POST control-plane API and admin UI history;
- preserve Knowledge/Core boundary and keep operation non-semantic.

## Non-goals

No automatic sync, background retry, Vault import, directory scan, YAML/Wiki Link processing, Git integration, conflict merge, scheduler, AI or MarkOrbit Core behavior.

## Acceptance

1. New writes require READY Staging + ACTIVE exact Vault binding + ready server root.
2. PENDING is durable before filesystem activity.
3. Exact replay uses the same frozen destination.
4. A post-write/pre-receipt crash can reconcile `ALREADY_PRESENT` without rewriting.
5. A persisted projection receipt can finalize without current filesystem configuration.
6. Changed binding/root cannot silently redirect a PENDING write.
7. Different existing Vault content is never overwritten.
8. Node 22/24 format, lint, typecheck, tests, build and UI Preview pass.
