# CollectionPlan Registry and Scheduling Intent

## Purpose

The CollectionPlan Registry stores locked Schema v1 `CollectionPlan` objects. A plan records what MarkOrbit Knowledge is intended to collect, which source and exact ConnectorManifest contract apply, which policy limits must be respected, which artifact kinds are expected and which schedule expression should eventually drive execution.

A CollectionPlan is not an execution record.

```text
SourceDefinition
      ↓ exact connector binding
ConnectorManifest
      ↓ compatibility validation
CollectionPlan
      ↓ future scheduler boundary
Job / CollectionRun (not implemented)
```

## Persistence

The SQLite reference adapter applies migration `0003_collection_plan_registry` when the CollectionPlan repository is initialized. The table stores:

- canonical Schema v1 JSON;
- Workspace and Source IDs;
- plan name and lifecycle status;
- schedule mode and priority;
- bound Connector ID derived from the SourceDefinition;
- output artifact kinds;
- creation and update timestamps.

The canonical JSON document remains authoritative. Indexed columns support filtering, uniqueness and administration views.

Plan names are unique within one source. The same plan name may be reused for another source.

## Lifecycle

New plans default to `PAUSED`.

- `PAUSED`: intent is stored but is not eligible for execution;
- `ACTIVE`: intent is enabled and must satisfy active source and connector requirements;
- `ARCHIVED`: historical intent is retained and becomes immutable.

Archiving a plan clears it from `SourceDefinition.defaultCollectionPlanId` when necessary. Archived plans cannot become defaults or be reactivated.

No lifecycle state means that a scheduler is running. The administration API therefore reports `runtimeState: NOT_SCHEDULED` and does not calculate a next-run timestamp.

## Compatibility validation

All plans require:

- an existing SourceDefinition;
- the same Workspace as the source;
- the exact ConnectorManifest version bound by the source;
- source-type support in the manifest;
- requested output artifact kinds contained in the manifest output range;
- `RENDER_JAVASCRIPT` when JavaScript rendering is requested;
- `FETCH_ATTACHMENTS` when attachment fetching is requested;
- `CHECK_UPDATE` or `WATCH` for `CHANGE_WATCH` schedules.

An `ACTIVE` plan additionally requires:

- an `ACTIVE` SourceDefinition;
- an `ACTIVE` exact ConnectorManifest version;
- the ConnectorManifest `COLLECT` capability.

Paused plans may remain attached to deprecated or disabled connector versions so that historical configuration can be preserved. They cannot be activated until compatibility is restored.

## Default plan

A SourceDefinition may identify one default CollectionPlan. The default must:

- exist;
- belong to the same source;
- not be archived.

Default-plan changes use a dedicated validated endpoint and SourceDefinition optimistic concurrency. Generic SourceDefinition PATCH requests cannot write `defaultCollectionPlanId` directly.

## API boundary

The CollectionPlan APIs manage intent only:

- list, create, read and update plans;
- change lifecycle status;
- list plans for a source;
- select a source default plan.

They do not:

- parse cron expressions into next-run timestamps;
- create jobs or collection runs;
- acquire leases;
- contact a Worker;
- execute health checks;
- run Crawl4AI;
- create RawArtifacts.

These operations require later scheduler, job and worker contracts.

## Future execution boundary

A future scheduler may read active CollectionPlans and create immutable Job or CollectionRun records. That scheduler must record the plan version or snapshot used at dispatch time. It must not mutate the CollectionPlan into an execution log.
