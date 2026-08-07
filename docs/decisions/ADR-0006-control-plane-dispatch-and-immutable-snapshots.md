# ADR-0006: Control-plane dispatch and immutable execution snapshots

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

CollectionPlan now records durable collection policy and scheduling intent. The next boundary is to record requested work without prematurely coupling the administration application to Worker leases, Crawl4AI processes, queues or RawArtifact upload protocols.

If the system treated a CollectionPlan as an execution record, later edits would destroy historical intent. If the administration API could write all runtime statuses, it could fabricate Worker evidence or bypass future lease rules. Repeated operator requests also need protection against duplicate work.

## Decision

1. Add Execution Contract v1 outside locked Schema v1.
2. Represent one dispatch as a `CollectionRun` aggregate with one or more `Job` attempts.
3. Store complete immutable snapshots of the CollectionPlan, SourceDefinition and exact ConnectorManifest version.
4. Create the CollectionRun and initial Job in one database transaction.
5. Create only `PENDING` records from the control plane.
6. Permit the control plane only to cancel work while the run and jobs remain pending.
7. Reserve Worker-owned states for a future authenticated Worker protocol.
8. Accept an optional Workspace-scoped idempotency key and replay the original result for the same dispatch.
9. Derive JobType deterministically and require exact Connector support.
10. Do not infer progress, next-run time, collection results or RawArtifacts.

## Consequences

### Positive

- Pending work is durable and auditable before Worker infrastructure exists.
- Historical intent survives future registry edits.
- Idempotent dispatch prevents accidental duplicate work.
- Future Worker implementations receive a stable claim boundary.
- UI language can distinguish recorded work from actual execution evidence.

### Costs

- Snapshot JSON duplicates registry data.
- Plan or Connector corrections after dispatch require a new run rather than mutation of history.
- Worker state transitions and retries require a later protocol and additional migrations.
- PENDING records may remain indefinitely until a Worker runtime or operator cancellation exists.

## Rejected alternatives

### Add execution fields directly to CollectionPlan

Rejected because plans are reusable intent, while executions are historical events.

### Invoke Crawl4AI directly from the administration HTTP request

Rejected because long-running acquisition needs isolation, retry, resource control, observability and local-runtime support.

### Store only foreign keys to current registries

Rejected because later edits would make historical runs impossible to reconstruct reliably.

### Allow the administration API to mark work completed

Rejected because completion must be supported by future Worker and artifact evidence, not an operator-controlled status button.

### Generate duplicate work and deduplicate later

Rejected because side effects should be prevented at the dispatch boundary through transactional idempotency.
