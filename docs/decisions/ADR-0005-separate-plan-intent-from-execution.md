# ADR-0005: Separate CollectionPlan intent from execution

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

MarkOrbit Knowledge needs a visual way to define recurring collection behavior before the scheduler, queue, Worker runtime and Crawl4AI integration exist. Combining desired schedule, mutable policy, runtime attempts and artifact results in one object would make history unreliable and force the control plane to claim execution facts it cannot currently observe.

Schema v1 already defines `CollectionPlan` as a source-bound policy and schedule object. It does not define Job, CollectionRun, lease or next-run evidence.

## Decision

1. Persist CollectionPlan as mutable scheduling intent with optimistic concurrency.
2. Default new plans to `PAUSED`.
3. Require explicit activation after compatibility validation.
4. Report runtime state only as `NOT_SCHEDULED` until a scheduler exists.
5. Do not infer or display next-run timestamps.
6. Do not create fake execution counts, success states or health evidence.
7. Keep future Job and CollectionRun records immutable and separate from CollectionPlan.
8. Require future execution records to reference or snapshot the plan used for dispatch.
9. Treat archived plans as immutable historical intent.

## Consequences

### Positive

- The UI can manage real durable collection policy without pretending that acquisition runs.
- Source, connector and output compatibility is validated before activation.
- Future execution history can remain immutable even when a plan changes.
- Scheduler and Worker implementations can be replaced without changing Schema v1 CollectionPlan semantics.

### Costs

- An `ACTIVE` plan still does nothing until a scheduler is implemented.
- Users must understand the distinction between enabled intent and actual runtime execution.
- Next-run calculation, missed schedules and execution history remain unavailable.

## Rejected alternatives

### Store schedule fields directly on SourceDefinition

Rejected because one source may require multiple strategies, priorities or output profiles, and because plan lifecycle should not redefine source identity.

### Treat every CollectionPlan update as an execution

Rejected because configuration changes are not collection attempts and provide no artifact or Worker evidence.

### Add a temporary fake Job table

Rejected because placeholder runtime records would become accidental contracts and contaminate future audit history.
