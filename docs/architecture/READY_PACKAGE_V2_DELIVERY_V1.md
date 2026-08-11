# ReadyPackage V2 Delivery Protocol V1

## Purpose

R1-K14 defines the Knowledge-owned outbound delivery foundation for K13 `ReadyPackageV2` and `ReadyPackageContentExportV2`.

This milestone does **not** claim that MarkOrbit Core already implements this consumer contract. It deliberately stops at a safe Knowledge-side boundary that can prepare and, only when an operator explicitly configures a dedicated V2 consumer endpoint, submit a frozen V2 request without ever reusing the frozen V1 Core intake endpoint.

## Compatibility boundary

ReadyPackage V1 / Content Export V1 and their existing Core intake/content endpoints remain unchanged.

V2 delivery uses a separate protocol:

- protocol version: `1.0`;
- request object: `READY_PACKAGE_V2_DELIVERY_REQUEST`;
- result object: `READY_PACKAGE_V2_DELIVERY_RESULT`;
- target service: `MARKORBIT_CORE`;
- payload: one complete `ReadyPackageContentExportV2` plus frozen routing and identity metadata.

The V2 request must never be sent to `MARKORBIT_CORE_INTAKE_URL`.

## Request

`ReadyPackageV2DeliveryRequestV1` freezes:

- `deliveryId`;
- ReadyPackage V2 ID;
- Knowledge Workspace ID;
- canonical Core Workspace UUID;
- ReadyPackage evidence digest;
- SHA-256 of canonical serialized Content Export V2;
- complete Content Export V2;
- `submittedAt`.

The persisted exact JSON body is hashed again as `requestSha256`. The stable idempotency key is derived from the durable delivery ID.

## Result

A consumer result must echo:

- protocol version;
- delivery ID;
- ReadyPackage ID;
- status: `RECEIVED`, `ACCEPTED`, or `REJECTED`;
- exact `requestSha256`.

A mismatched result is rejected by Knowledge and cannot finalize the local submission.

## Durable lifecycle

K14 intentionally separates **Prepare** from **Submit**.

```text
NOT_PREPARED
  -> PREPARED
  -> OUTCOME_UNKNOWN        (attempt started, no durable transport result)
  -> FINALIZATION_PENDING   (transport result durable, local finalization incomplete)
  -> DELIVERED              (local result durable)
```

### Prepare

Before any network activity, Knowledge:

1. resolves the durable ReadyPackage V2;
2. resolves the current Knowledge -> Core Workspace UUID binding;
3. rebuilds and verifies Content Export V2 from authoritative K12/K13 evidence and immutable CAS bytes;
4. canonical-serializes the export and hashes it;
5. freezes delivery ID, target Workspace, submitted time, full request JSON, request SHA-256 and idempotency key;
6. persists one immutable submission for the ReadyPackage V2.

Once prepared, later Workspace binding changes do not retarget the frozen submission.

### Submit

Before the network request, Knowledge persists the transport-attempt marker. Therefore a crash immediately before or during the request is conservatively treated as an unknown outcome.

If the request outcome is unknown, retry sends the exact same `requestJson` with the exact same idempotency key.

After a real HTTP success, Knowledge persists the validated transport result **before** local finalization.

If the process crashes after that point, retry finalizes locally from the durable transport result and does not require the destination URL, secret, protocol declaration, current Workspace binding, Vault, CAS, or another HTTP request.

A fully finalized submission replays locally without network activity.

## Outbound capability gate

Outbound V2 HTTP is disabled unless all of the following are explicitly configured:

- `MARKORBIT_CORE_V2_DELIVERY_URL` — dedicated HTTP(S) V2 consumer endpoint;
- `MARKORBIT_CORE_INTERNAL_SECRET` — internal service authorization secret;
- `MARKORBIT_CORE_V2_PROTOCOL_VERSION=1.0` — explicit operator declaration that the destination supports this V2 protocol.

Knowledge rejects configuration where the V2 delivery URL equals the existing `MARKORBIT_CORE_INTAKE_URL`.

Configuration readiness is not a network health probe and does not claim that Core has implemented the receiver. The actual Core consumer must be implemented and validated separately before production submission is enabled.

## Browser/Admin boundary

The Admin workbench exposes:

- explicit `Freeze V2 Delivery` action;
- explicit submit action;
- exact-request retry after unknown outcome;
- local-only finalization after durable transport result;
- request SHA-256, Content Export SHA-256, frozen Core Workspace, attempt count and result status.

The browser does **not** receive:

- frozen `requestJson` containing Markdown content;
- the idempotency key;
- internal authorization secret;
- configured destination URL.

## Persistence

Migration `0030_ready_package_v2_delivery_submissions` adds a dedicated immutable delivery ledger.

Invariant: one frozen V2 delivery submission per `(workspace_id, ready_package_id)`.

The V1 `ready_package_core_intake_submissions` ledger is not reused or modified.

## Explicit non-goals

K14 does **not**:

- modify MarkOrbit Core;
- claim a Core V2 receiver exists;
- send V2 through V1 intake/content routes;
- alter ReadyPackage V1 or Content Export V1;
- fabricate conversion provenance;
- perform semantic/AI interpretation;
- create automatic/background delivery;
- automatically retry unknown outcomes;
- change Vault synchronization behavior.

## Follow-up

A later cross-repository milestone may implement the matching Core V2 receiver and real Knowledge->Core integration tests. That work must preserve this exact-request/idempotency/finalization model and must not weaken V1 compatibility.
