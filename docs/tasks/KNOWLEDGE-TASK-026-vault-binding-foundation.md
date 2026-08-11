# KNOWLEDGE-TASK-026 — Vault Binding Foundation

Establish the first real Obsidian/Vault control-plane boundary in MarkOrbit Knowledge.

## Scope

- Lock `VaultBindingV1` as a Workspace-scoped local-filesystem binding contract.
- Persist exactly one binding per Workspace in SQLite.
- Store only a portable relative Vault directory; keep the server absolute root in deployment configuration.
- Require optimistic revisions for updates and enable/disable transitions.
- Expose binding configuration and filesystem-root readiness through the admin API without exposing the absolute root.
- Replace the Vault module preview with a real admin binding control.
- Preserve a fail-closed path policy suitable for later Windows/macOS/Linux Local Worker use.

## Non-goals

No automatic filesystem export/import, no Vault scan, no Wiki Link parser, no YAML round trip, no Git sync, no conflict engine, no retry scheduler, no semantic/AI analysis and no MarkOrbit Core changes.

## Follow-up

The next Vault milestone should introduce an explicit durable Vault Export run/receipt boundary that consumes an ACTIVE `VaultBindingV1` and the existing controlled READY-Staging projection primitive.
