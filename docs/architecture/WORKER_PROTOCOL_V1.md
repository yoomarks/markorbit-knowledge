# Worker Protocol v1

## Purpose

Worker Protocol v1 defines the authenticated boundary between the MarkOrbit Knowledge control plane and independent Worker or Mo Crawl runtimes.

It is separate from:

- Schema v1 acquisition and staging objects;
- Execution Contract v1 `CollectionRun` and `Job` objects;
- future Connector invocation and RawArtifact upload protocols.

```text
PENDING Job
   ↓ authenticated claim
ACTIVE JobLease + LEASED Job
   ↓ future execution protocol
Connector runtime
```

`LEASED` means reserved work only. It does not mean execution started, Crawl4AI ran or data was collected.

## Version

```text
contractVersion: "1.0"
```

## WorkerDefinition

A WorkerDefinition records reviewed control-plane intent:

- typed `wrk_` identity;
- Workspace boundary;
- display name;
- desired state: `ACTIVE`, `DRAINING` or `DISABLED`;
- runtime identifier and semantic version;
- supported JobTypes;
- exact Connector ID/version bindings;
- declared Connector capabilities;
- maximum concurrency;
- labels and optional namespaced extensions.

Connector versions are exact. Worker Protocol v1 does not perform semantic-version range resolution.

## WorkerHeartbeat

An authenticated WorkerHeartbeat records:

- typed `hbt_` identity;
- Worker and Workspace identity;
- Worker-observed timestamp;
- independently recorded control-plane receipt timestamp;
- runtime version;
- `HEALTHY`, `DEGRADED` or `ERROR` evidence;
- active lease IDs known by the Worker;
- optional bounded diagnostic extensions.

The control plane rejects excessive clock skew and lease IDs that are unknown, inactive or owned by another Worker.

Only the latest 100 heartbeat records per Worker are retained by the reference adapter. This bounds growth while preserving recent audit evidence.

## Effective status

Effective status is derived rather than accepted from the Worker:

| Effective status | Rule                                        |
| ---------------- | ------------------------------------------- |
| `DISABLED`       | desired state is disabled                   |
| `DRAINING`       | desired state is draining                   |
| `OFFLINE`        | no heartbeat or heartbeat is stale          |
| `ERROR`          | fresh heartbeat reports error               |
| `BUSY`           | active lease count reaches max concurrency  |
| `ONLINE`         | fresh active Worker with remaining capacity |

The default heartbeat freshness threshold is 90 seconds. It is configurable at repository construction without changing the contract.

## JobLease

A JobLease records:

- typed `lse_` identity;
- Worker, Job, CollectionRun and Workspace identities;
- exact JobType and Connector ID/version;
- lifecycle status;
- acquired, expiry and update timestamps;
- optional closure timestamp and reason.

Lease lifecycle:

```text
ACTIVE → ACTIVE     renew
ACTIVE → RELEASED   Worker release
ACTIVE → EXPIRED    deterministic reap
ACTIVE → REVOKED    administrative disablement
```

Job effects:

```text
claim:   PENDING → LEASED
release: LEASED  → PENDING
expire:  LEASED  → PENDING
revoke:  LEASED  → PENDING
renew:   LEASED  → LEASED
```

The parent CollectionRun remains `PENDING`. No retry attempt is created and `Job.attempt` is not incremented.

## Claim ordering

Compatible work is selected deterministically:

1. `CRITICAL`, `HIGH`, `NORMAL`, `LOW`;
2. earliest `availableAt`;
3. earliest `createdAt`;
4. stable Job ID.

Claiming revalidates Workspace, Worker desired state, heartbeat freshness, capacity, Job status, JobType, exact Connector binding and required capabilities in one transaction.

## Security

Worker bearer credentials and lease tokens:

- are generated from cryptographically random bytes;
- are revealed only once;
- are never returned by list or detail APIs;
- are stored only as SHA-256 digests;
- are verified with constant-time comparison;
- are invalidated by credential rotation or Worker disablement.

Protocol objects reject credential-like values in extensions and diagnostics. Worker endpoints accept declarative identities and evidence only; they do not accept scripts, commands, shell arguments or executable code.

## Deferred states

Worker Protocol v1 does not permit writes to:

- `RUNNING`;
- `UPLOADING`;
- `VERIFYING`;
- `COMPLETED`;
- `RETRY`;
- `FAILED`;
- `DEAD_LETTER`.

Those states require a future execution-evidence protocol and are not implied by a lease.
