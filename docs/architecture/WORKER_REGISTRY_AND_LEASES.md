# Worker Registry, Heartbeat and Lease Architecture

## Scope

The Worker Registry is the first authenticated bridge from the MarkOrbit Knowledge control plane to independent execution runtimes.

It owns:

- Worker definitions;
- Worker credential digests and rotation metadata;
- heartbeat evidence;
- effective-status derivation;
- Job lease ownership;
- lease renewal, release, expiry, revocation and reap.

It does not own Connector execution, Crawl4AI invocation, RawArtifact creation or completion evidence.

## Components

```text
Admin UI / API
    ↓
WorkerRegistryRepository
    ├─ Worker definitions
    ├─ Credential digests
    ├─ Heartbeat evidence
    └─ Job leases
          ↓
Execution Ledger Job
PENDING ↔ LEASED
```

Independent Workers call the Worker Protocol endpoints with a bearer credential. The administration process never loads or executes Worker code.

## Persistence

Migration `0005_worker_registry_and_leases` adds:

- `worker_definitions`;
- `worker_credentials`;
- `worker_heartbeats`;
- `job_leases`.

A partial unique index enforces one active lease per Job. Claim uses `BEGIN IMMEDIATE` in the SQLite reference adapter to serialize eligibility revalidation, Job transition and lease creation.

The full canonical Worker Protocol object is stored as JSON alongside selected indexed columns. Every object is validated before write and after read.

## Authentication boundary

Worker credentials use this lifecycle:

```text
create Worker → reveal credential once → store digest
rotate credential → invalidate old credential → reveal replacement once
DISABLED Worker → authentication may validate digest but protocol access is forbidden
```

List and detail APIs never expose plaintext credentials, digests or lease-token digests.

## Heartbeat boundary

The Worker reports an observed timestamp; the control plane separately records receipt time. Effective status uses receipt time, not Worker time.

Default thresholds:

- heartbeat freshness: 90 seconds;
- permitted clock skew: 5 minutes;
- heartbeat history retained: latest 100 records per Worker.

Thresholds are constructor configuration, not contract fields.

## Claim transaction

The claim operation:

1. authenticates the Worker;
2. reaps expired leases relevant to current state;
3. reloads Worker definition and latest heartbeat;
4. checks desired state, freshness, health and capacity;
5. selects deterministic compatible pending work;
6. validates exact JobType, Connector version and required capabilities;
7. changes only the Job from `PENDING` to `LEASED`;
8. creates one active lease and returns its token once;
9. leaves CollectionRun `PENDING`.

When no compatible work exists, the response is a successful empty result.

## Capability matching

A Worker must declare:

- the JobType;
- the exact Connector ID and version;
- every capability required by the immutable Job snapshots.

Every collection Job requires `COLLECT`. Plan policy may additionally require:

- `RENDER_JAVASCRIPT`;
- `FETCH_ATTACHMENTS`;
- `CHECK_UPDATE` or `WATCH` for change-watch plans.

A Worker cannot claim work merely because it supports the same general runtime technology.

## Lease security

Lease tokens are independent from Worker credentials. Both are required for renewal and release.

The database stores only token digests. Ownership and token checks occur before any transition. Expired, released or revoked leases cannot be reused.

Renewal uses a sliding expiry bounded by a maximum lifetime measured from acquisition. When a renewal request observes that a lease has already expired, the control plane must persist the `EXPIRED` transition and return the Job to `PENDING` before returning the conflict response.

## Administrative disablement

Changing desired state to `DISABLED` atomically:

- updates the Worker definition;
- revokes all active leases;
- returns their Jobs to `PENDING`;
- leaves attempts and CollectionRuns unchanged.

`DRAINING` prevents new claims but does not revoke existing leases.

## Recovery

No background scheduler is required in this phase. Expired leases are recovered by:

- explicit `POST /api/leases/reap`;
- the next claim transaction.

Reaping is idempotent.

## Deployment boundary

The SQLite adapter is appropriate for local and single-node control-plane deployments. The repository interface and transaction semantics must be preserved by a future PostgreSQL adapter.

A production Worker remains a separate process or service:

```text
MarkOrbit Knowledge control plane
        ↓ authenticated declarative lease
Independent Worker / Mo Crawl runtime
```
