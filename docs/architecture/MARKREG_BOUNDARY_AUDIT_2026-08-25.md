# K-CASE-000 — MarkReg Boundary Audit — 2026-08-25

Status: **RESOLVED FOR CONTRACT DESIGN — LIVE CASE ACCEPTANCE REMAINS SEPARATE**

## Resolution checkpoint

The earlier discovery pass was stale. A fresh read-only audit of `yoomarks/markorbit@26eaf35545bb1044f84a78d659fbdc408bc7582f` located the real MarkReg runtime and its authoritative contracts.

MarkReg is **not** a separate repository. It is the independently deployable service at:

- repository: `yoomarks/markorbit`
- service: `services/markreg`
- UI: `apps/markreg-web`
- default service port: `4105`
- service role: international trademark recommendation, order and Matter service

`services/markreg/README.md` explicitly states that MarkReg is independently deployable and must not import another service implementation or read another service database. Knowledge therefore integrates through an authorized service/export boundary, never by reading MarkReg persistence directly.

## Frozen producer identity

The authoritative main-repo contract defines:

```text
FormalMatterId = `formal-matter_${string}`
FormalMatter.kind = TRADEMARK_REGISTRATION
FormalMatter.status = OPEN
FormalMatter.version = 1   // current V1 contract
FormalMatter.snapshotSchemaVersion = 1
FormalMatter.snapshotSha256 = lowercase SHA-256
```

A `FormalMatter` also carries exact source lineage:

- `workspaceId`;
- `sourceCustomerConfirmationId` + version;
- `sourceMatterDraftId` + version;
- `sourceQuoteId` + version;
- immutable `sourceSnapshot`;
- `snapshotSha256`;
- creator and created/updated timestamps.

The source snapshot contains the confirmed customer source, quote currency/total, exact READY Matter Draft identity/version/readiness, and preparation fields. Knowledge must retain the MarkReg matter identity/version/snapshot fingerprint instead of manually reconstructing this data.

## Integration surface

The MarkReg service exposes a real V1 HTTP surface. Relevant Case-source reads include:

- `GET /v1/formal-matters`
- `GET /v1/formal-matters/:formalMatterId`
- `GET /v1/formal-matters/:formalMatterId/lifecycle`
- `GET /v1/operations/formal-matters/:formalMatterId/lifecycle-provenance`
- `GET /v1/document-packages`
- `GET /v1/document-packages/:documentPackageId`

Relevant MarkReg write surfaces exist as well, including `POST /v1/formal-matters` and Document Package mutations, but Knowledge Case ingestion must not call operational mutation endpoints merely to collect a dossier.

Gateway already treats MarkReg as a separate downstream service via `MARKREG_URL` with a default local target of `http://127.0.0.1:4105`. The exact future MarkReg → Knowledge promotion route is **not** frozen by this audit and must not be invented inside Knowledge.

## Authorization model

The durable MarkReg service boundary requires trusted internal service authentication and a Workspace Principal.

Observed service-side controls include:

- `x-markorbit-internal-authorization` matching `MO_INTERNAL_SERVICE_SECRET`;
- `x-markorbit-principal` parsed as an internal Workspace Principal;
- `x-markorbit-workspace-id` must match the principal workspace for lifecycle surfaces;
- Workspace-scoped reads enforce permissions such as `matter:read`;
- lifecycle provenance requires `review:perform`;
- operational transitions require `matter:manage`;
- Document Package operations use explicit permissions such as `document-package:read`, `document-package:prepare`, `instruction-ledger:write`, and `document-package:mark-ready`.

Knowledge must not store or bypass these MarkReg permissions. A later producer bridge must pass only authorized source references/evidence for the same Workspace/access scope.

## Document/reference model

MarkReg has a durable Document Package subsystem linked to an exact Formal Matter/review snapshot.

Important evidence facts:

- document packages persist `formal_matter_id`, source Formal Matter version and SHA-256;
- document evidence is recorded per requirement;
- evidence metadata includes document type/display name, SHA-256 checksum, optional file/media/size metadata, optional `storageReference`, verification status and structured note;
- an already recorded evidence fingerprint cannot be overwritten with different evidence;
- instructions are an append/supersede ledger rather than silent in-place history replacement.

This is sufficient to freeze Knowledge Case document collection around references/fingerprints rather than creating a parallel operational document store.

## Status/event history model

MarkReg has a durable lifecycle projection keyed by Workspace + `FormalMatterId`.

It exposes:

- current lifecycle view;
- ordered lifecycle event projections;
- event ID/version/state/code/customer-safe label/summary/occurred time;
- provenance to reviewed source admission/evidence receipt/provider return/Formal Matter;
- deterministic/idempotent projection writes;
- a customer-safe lifecycle route and a richer operations provenance route.

The lifecycle model explicitly does **not** claim that customer-facing lifecycle text is an officially verified status (`officialStatusVerified: false`). Knowledge must preserve this provenance/boundary if those events later enter a dossier.

## Correspondence model

No dedicated MarkReg email/thread/message/attachment communication model was located in the audited service or shared main-repo capability implementation.

This is a determined absence, not a reason to guess a producer API. The main-repo roadmap separately defines MO-CAP-003 Managed Communication (Email first). Until that capability exists, Case communications may only be collected from already authorized MarkReg evidence references or other proven source interfaces; Knowledge must not create a new mailbox transport to fill the gap.

## Fee/payment model

The Formal Matter source snapshot contains quote identity/version plus currency and total minor units. MarkReg also contains commercial/order flows, while a separate `services/payment` exists in the main repository.

K-CASE-000 does **not** establish that Knowledge is authorized to ingest payment-service records. K-CASE-001 therefore records only the MarkReg matter source identity. Detailed fee/payment evidence collection remains a later K-CASE-004 permission/source question.

## Discovery receipt

```text
system_name: MarkReg
repository_or_service: yoomarks/markorbit :: services/markreg
owner: MarkReg service owns the operational Formal Matter; Gateway is the authenticated HTTP edge
canonical_matter_id: FormalMatterId = formal-matter_${string}
matter_version_or_snapshot: FormalMatter.version + snapshotSchemaVersion + snapshotSha256
integration_surface: MarkReg V1 internal HTTP routes; no direct database integration
source_workspace_scope: FormalMatter.workspaceId / Workspace Principal
source_snapshot: immutable FormalMatterSourceSnapshot with exact lineage
source_read_routes: formal-matters, lifecycle, lifecycle-provenance, document-packages
auth_model: internal service secret + Workspace Principal + explicit permissions
document_reference_model: durable Document Package evidence metadata + checksum + optional storageReference
correspondence_model: no dedicated model found; shared Managed Communication remains pending
status_event_model: durable lifecycle current view + event projections with provenance
fee_payment_model: quote snapshot facts available; broader payment evidence not frozen by this audit
example_completed_matter_ref: not claimed from repository fixtures; first real matter acceptance belongs to K-CASE-008
verified_main_repo_sha: 26eaf35545bb1044f84a78d659fbdc408bc7582f
verified_at: 2026-08-25
verified_by: Knowledge engineering read-only source audit
```

## What is now unblocked

K-CASE-001 may proceed because the producer identity, Workspace scope, exact matter ID, version/snapshot semantics and real retrieval surfaces are known.

The narrow contract boundary is:

```text
MarkReg FormalMatter
  -> exact sourceWorkspaceId
  -> exact FormalMatterId
  -> exact FormalMatter version
  -> exact snapshotSha256
  -> authorized opaque retrieval reference
  -> deterministic Knowledge Case Candidate identity
```

K-CASE-002 remains a main-repo/MarkReg UX change and is **not** implemented by this Knowledge-side audit. K-CASE-008 still requires one real completed matter and live evidence; repository fixtures are not accepted as live case evidence.

## Frozen product boundary

The product rule remains unchanged:

```text
real MarkReg matter (system of record)
-> operator selects "Send to Knowledge Case"
-> idempotent Case Candidate
-> Knowledge receives/pulls authorized source evidence
-> objective Case Dossier assembly
-> privacy/redaction/review/versioning
```

Knowledge must not create a replacement matter-management system, copy MarkReg tables, or require operators to re-enter complete matters manually.
