# MarkOrbit Knowledge Deep Review & Main Repo Handoff — 2026-08-12

## Status and authority

This document is a review and cross-repository handoff. It is **not** authorization to merge, deploy, migrate production data, change Core semantic authority, or reorder the MarkOrbit main-repository roadmap.

- Knowledge repository: `yoomarks/markorbit-knowledge`
- Knowledge reviewed baseline: `ddc885f7cfb71dcc2fc94941c971ddea62414fbf`
- Main repository: `yoomarks/markorbit`
- Main reviewed baseline: `3f2d184b85e1dbb837b5360b083b181db25b43e1`
- Review date: `2026-08-12`
- Main-repo owner must explicitly authorize/schedule the work described below.
- Existing main-repo authority/roadmap remains authoritative. This handoff must not silently supersede M6 or any later owner-approved work package.

---

## 1. Executive verdict

### 1.1 Is the main body of MarkOrbit Knowledge complete?

**Yes — the architectural/control-plane main body is complete.**

The project is no longer in a “build the platform foundation” phase. The difficult structural boundaries and the two critical end-to-end directions are already present:

1. **Acquisition direction**
   - governed Source / Connector / Plan / Run / Worker control plane;
   - real production Crawl4AI HTML/Markdown acquisition;
   - immutable RawArtifact ingestion and CAS;
   - ConversionRun/Staging control boundaries;
   - ReadyPackage V1 / Content Export V1 path to the existing Core V1 consumer.

2. **Vault / downstream direction**
   - explicit Vault binding/export/inspection;
   - reviewed import intent and explicit import execution;
   - immutable Vault-origin Staging verification/finalization;
   - provenance-preserving Canonical Downstream Document;
   - ReadyPackage V2 / Content Export V2;
   - durable V2 delivery preparation, retry semantics, append-only audit, K16 reconciliation and fail-closed operational diagnosis.

The current architecture does **not** need another foundational rewrite, generic platform extraction, new “brain” service, or a broad persistence refactor.

### 1.2 Is everything remaining only small trimming?

**No.** The remaining work has two different classes and must not be conflated.

#### A. True close-out / trimming work

These are bounded hardening/productization items:

- README/documentation reconciliation for K16;
- top-level Admin modules that still fall back to preview shells;
- operator wording, empty/error states and workflow affordances;
- additional observability/metrics and runbooks;
- extra regression/chaos coverage around already-frozen state machines.

These do not change the architecture.

#### B. Substantive MVP breadth still missing

The original PRD describes a broader ingestion/runtime surface than the currently productionized path. The following are still real work packages, even though they fit the existing architecture:

- production **Manual Upload** ingestion;
- production **Local Folder Worker** ingestion;
- arbitrary attachment/PDF acquisition;
- real converter execution for the required file families (not only contracts/ledgers/runtime protocol);
- automatic scheduling/change-watch orchestration;
- productized operational surfaces for modules still represented by previews where required by the PRD.

These are **horizontal extensions over a finished backbone**, not evidence that the backbone is unfinished.

### 1.3 Bottom-line classification

| Area                                           | Review verdict                                    | Nature of remaining work                          |
| ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| System boundary / authority model              | COMPLETE                                          | Freeze; do not redesign                           |
| Source/Connector/Plan/Run/Worker control plane | COMPLETE                                          | Hardening only                                    |
| Production Web HTML/Markdown acquisition       | COMPLETE                                          | Provider hardening/expansion                      |
| RawArtifact immutability / CAS / provenance    | COMPLETE                                          | Hardening only                                    |
| Conversion contracts / leases / ledger         | COMPLETE as control plane                         | Real converter/provider breadth still substantive |
| Obsidian Vault explicit workflow               | COMPLETE for current explicit/manual safety model | UX/runbook hardening                              |
| Canonical Downstream / ReadyPackage V2         | COMPLETE                                          | Hardening only                                    |
| V2 delivery reliability/reconciliation         | COMPLETE on Knowledge side                        | Blocked on real main-repo V2 consumer             |
| Manual Upload                                  | NOT PRODUCTIONIZED                                | Substantive extension                             |
| Local Folder Worker                            | NOT PRODUCTIONIZED                                | Substantive extension                             |
| PDF/DOCX/etc. real conversion breadth          | PARTIAL                                           | Substantive extension                             |
| Automatic scheduling/change watch              | NOT IMPLEMENTED                                   | Substantive extension                             |
| Full Admin productization                      | PARTIAL                                           | Mostly bounded product/ops work                   |
| Main-repo ReadyPackage V2 consumer             | NOT IMPLEMENTED                                   | Cross-repo blocker                                |

**Conclusion:** MarkOrbit Knowledge has completed its main structural construction. The next phase should be treated as **coverage completion + production hardening + cross-repo integration**, not another architecture phase.

---

## 2. Deep-review findings by severity

### P0 — No current architectural blocker found inside the completed Knowledge backbone

No P0 defect was found that requires invalidating K01–K16 or rebuilding the data/control architecture. K16 passed Node 22/24 format, lint, typecheck, test and build validation, and the Admin UI preview workflow passed.

### P1 — Main repository does not yet implement the ReadyPackage V2 consumer

This is the most important current integration gap.

Knowledge now has a frozen V2 delivery protocol, durable exact-request/idempotency retry behavior, append-only evidence, restart-safe finalization and fail-closed reconciliation. However, outbound delivery remains intentionally disabled until a dedicated V2 endpoint declares protocol `1.0` support.

This is **not** a reason to change Knowledge K14–K16. It is work owned by the main repository consumer side.

### P1 — Original PRD ingestion breadth is not complete

The current real production provider is Web/Crawl4AI HTML/Markdown. The repository itself explicitly states that arbitrary PDF/attachment acquisition, converter execution and automatic scheduling are not implemented yet.

Manual Upload and Local Folder are part of the original MVP source/connector model and should be completed if the goal is “full PRD MVP,” not merely “usable production Web knowledge pipeline.”

### P2 — Conversion architecture is ahead of conversion provider coverage

Knowledge has already frozen substantial conversion control/runtime/execution contracts and persistent ledgers. This is good: real converters should plug into those boundaries rather than creating a parallel conversion system.

Remaining converter work should therefore be provider/runtime implementation and evidence verification, not a new conversion architecture.

### P2 — Admin navigation is broader than fully productized runtime pages

Some top-level modules still use preview/fallback surfaces. This is acceptable for architecture completion but should be closed before declaring the entire original PRD UX complete.

### P3 — Documentation reconciliation

The root README accurately lists the current gaps but its capability list currently stops at the K15 audit timeline and does not yet summarize K16 delivery reconciliation/fail-closed diagnosis. This is documentation drift, not a runtime blocker.

---

## 3. What Knowledge should build next (Knowledge-owned)

These are recommended workstreams, **not automatically authorized milestone IDs**.

### K-EXT-A — Manual Upload production ingestion

Goal: make `MANUAL_UPLOAD` a real governed source/provider path.

Acceptance shape:

- Workspace-scoped upload authorization;
- bounded file-size/media-type policy;
- immutable RawArtifact creation through the existing ingestion/CAS boundary;
- no direct bypass into Staging or Vault;
- exact provenance identifying manual upload source and actor/action evidence;
- idempotent/restart-safe persistence;
- Admin upload + artifact/result visibility;
- security tests for path/filename/content-type abuse.

### K-EXT-B — Local Folder Worker production ingestion

Goal: productionize `LOCAL_FOLDER` through the existing Worker/lease/provenance model.

Acceptance shape:

- explicit allowed-root configuration;
- traversal/symlink escape protection;
- file snapshot/digest before ingestion;
- immutable RawArtifact path;
- Worker lease ownership and restart recovery;
- no arbitrary host filesystem access outside configured roots;
- duplicate/version behavior proven with real files.

### K-EXT-C — Attachment and converter provider breadth

Goal: turn the already-frozen conversion system into real multi-file runtime capability.

Recommended first formats from the PRD:

- PDF;
- DOCX;
- TXT;
- JSON;
- CSV.

Do not create a shortcut converter path. Use the existing ConverterManifest → Profile → ConversionRun → conversion lease → verified Staging output model.

### K-EXT-D — Automatic scheduling/change-watch orchestration

Goal: add scheduled creation of governed work without weakening execution authority.

Required invariants:

- schedule creates/authorizes normal Runs/Jobs; it does not bypass them;
- no duplicate execution for the same schedule tick/idempotency identity;
- bounded retries and explicit terminal evidence;
- restart-safe scheduler state;
- pause/disable and operator visibility;
- automatic retry must never be introduced into K14–K16 V2 delivery evidence recovery semantics without a separately reviewed contract change.

### K-EXT-E — Product/operations close-out

After the substantive breadth above, complete the remaining preview-backed operational pages, alerts, runbooks, metrics and README/K16 reconciliation.

---

# 4. Main repository handoff — ReadyPackage V2 consumer

## 4.1 Why main-repo work is required

The main repository already has a proven V1 pattern under `services/core`:

- internal service authentication;
- canonical Workspace verification;
- `Idempotency-Key` handling;
- durable intake persistence;
- immutable Content Export V1 persistence;
- deterministic idempotency conflict behavior;
- bounded content body size;
- accepted-state transition after durable content persistence.

At the reviewed baseline, `services/knowledge` is still only an independent deployable service skeleton, while the real V1 Knowledge intake/content consumer is implemented in `services/core`.

The missing cross-repo capability is a **dedicated ReadyPackage V2 Delivery Protocol V1 consumer**.

## 4.2 Ownership decision gate

Before implementation, the main-repo owner must choose where the V2 receiver lives.

### Recommended low-risk choice for the first V2 receiver

Implement it **additively in `services/core` beside the proven V1 Knowledge intake infrastructure**.

Reasons:

- reuses proven internal auth, Workspace lookup, PostgreSQL/repository patterns and service runtime;
- minimizes cross-service networking and deployment work;
- does not require moving or rewriting V1;
- makes the first cross-repo V2 integration a small, auditable delta.

### Alternative

Implement the receiver in `services/knowledge` only if the owner explicitly wants to productionize that service boundary now. That is a larger milestone because the service is currently a skeleton and would need its own real routing/auth/persistence/runtime integration.

**Do not move the existing V1 consumer as part of this task.** Any ownership migration must be a separate architecture decision.

---

## 4.3 Frozen Knowledge-side protocol that main must consume

### Transport configuration expected by Knowledge

Knowledge enables V2 outbound transport only when all of the following are explicitly configured:

- `MARKORBIT_CORE_V2_DELIVERY_URL`
- `MARKORBIT_CORE_INTERNAL_SECRET`
- `MARKORBIT_CORE_V2_PROTOCOL_VERSION=1.0`

Knowledge sends:

- `POST` to the dedicated V2 URL;
- `Content-Type: application/json`;
- `Idempotency-Key: <stable frozen key>`;
- `x-markorbit-internal-authorization: <secret>`;
- `x-markorbit-ready-package-v2-delivery-protocol: 1.0`.

The V2 URL must **not** equal/reuse the frozen V1 Core intake URL.

### Exact request envelope

Main must accept the exact `ReadyPackageV2DeliveryRequestV1` shape:

```ts
{
  protocolVersion: "1.0";
  objectType: "READY_PACKAGE_V2_DELIVERY_REQUEST";
  deliveryId: string; // rvd_*
  readyPackageId: string; // rdp_*
  knowledgeWorkspaceId: string; // wsp_*
  target: {
    service: "MARKORBIT_CORE";
    workspaceId: string; // canonical Core UUID
  }
  readyPackageDigest: string; // sha256 hex
  contentExportSha256: string; // sha256 hex
  contentExport: ReadyPackageContentExportV2;
  submittedAt: string;
}
```

The request validator uses exact keys; main should not silently coerce V1 or invent missing V2 fields.

### Exact result envelope

Main must return a valid `ReadyPackageV2DeliveryResultV1` JSON body on a successful protocol response:

```ts
{
  protocolVersion: "1.0";
  objectType: "READY_PACKAGE_V2_DELIVERY_RESULT";
  deliveryId: string;
  readyPackageId: string;
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  requestSha256: string;
}
```

Knowledge verifies that:

- `deliveryId` exactly matches the frozen request;
- `readyPackageId` exactly matches the frozen request;
- `requestSha256` exactly equals SHA-256 of the frozen request JSON bytes/string sent by Knowledge.

A mismatched result is rejected and treated as an uncertain transport outcome.

---

## 4.4 Important main-repo implementation issue: exact request hashing

The current main-repo `service-kit` parses request bytes into JSON and exposes `JsonRequest.body`, but does **not** expose the original raw UTF-8 request body.

For V2, this matters because Knowledge requires the consumer result to echo SHA-256 of the **exact frozen request JSON** it sent.

Main must choose and test one of these bounded approaches:

1. **Preferred:** add an additive `rawBody`/raw-byte capability to `service-kit` for routes that opt in, keeping existing routes behavior unchanged; hash the exact received bytes.
2. If the team proves that parse → protocol-validated deterministic serialization is byte-identical to Knowledge's frozen serializer for all contract fixtures, a canonical serialization path may be used — but this must be cross-repo fixture-tested and must not rely on an undocumented assumption.

Do not calculate `requestSha256` from only selected fields or from `contentExportSha256`.

---

## 4.5 Recommended main-repo work packages

The identifiers below are handoff labels, not pre-authorized main-repo milestone IDs.

### CORE-KV2-WP-01 — Contract and ingress freeze

Deliverables:

- main-side exact V2 request/result validation;
- Content Export V2 validation;
- dedicated V2 route (recommended path: `/internal/knowledge/ready-packages/v2/deliveries`, final path owner-controlled);
- internal auth using the established `x-markorbit-internal-authorization` mechanism;
- require `Idempotency-Key`;
- require protocol header `x-markorbit-ready-package-v2-delivery-protocol: 1.0`;
- explicit bounded `bodyLimitBytes` (do not use the service-kit default 64 KiB for embedded Markdown payloads; V1 currently demonstrates a 12 MiB bounded content route);
- canonical Core Workspace lookup for `target.workspaceId`;
- tests proving the existing V1 endpoints remain byte/behavior compatible.

Acceptance:

- valid frozen Knowledge fixture is accepted;
- wrong protocol version is rejected;
- malformed/excess fields are rejected rather than coerced;
- V1 endpoint is untouched and cannot be used as V2 destination.

### CORE-KV2-WP-02 — Durable V2 delivery ledger and idempotency

Deliverables:

- PostgreSQL-backed V2 delivery record;
- durable identity by Workspace/delivery/idempotency dimensions;
- exact request SHA-256 persisted;
- same Idempotency-Key + same exact request replays deterministically without duplicate persistence;
- same Idempotency-Key + different request fails closed;
- concurrent duplicate submissions produce one durable logical delivery;
- restart-safe replay returns the same protocol result.

Recommended persisted evidence at minimum:

- `deliveryId`;
- `readyPackageId`;
- Core Workspace ID;
- Knowledge Workspace ID;
- idempotency key or secure deterministic identity as allowed by main policy;
- request SHA-256;
- readyPackage digest;
- content export SHA-256;
- consumer status;
- received/accepted timestamps;
- immutable linkage to persisted Content Export V2.

### CORE-KV2-WP-03 — Immutable Content Export V2 + provenance preservation

Deliverables:

- verify `contentExport.contractVersion === "2.0"` and exact object type;
- verify readyPackage IDs/digests/workspace IDs agree with the outer delivery request;
- recompute and verify `contentExportSha256` against the exact Content Export V2 serialization contract/fixture used by Knowledge;
- verify embedded content SHA-256, size, CAS reference relationship and UTF-8 Markdown media type;
- persist Content Export V2 immutably;
- preserve `provenance.origin.kind = "VAULT_IMPORT"` and its inspection/review/import/verification/finalization evidence;
- preserve `legalTruthVerified: false` as data, not reinterpret it as Core truth;
- do not fabricate V1 conversion provenance to make V2 look like V1.

Recommended first semantic rule: **none**. This milestone is ingestion/persistence only.

### CORE-KV2-WP-04 — Protocol result semantics and recovery

Define protocol statuses operationally and test them.

Recommended initial behavior:

- `ACCEPTED`: request and immutable Content Export V2 are durably persisted and all transport/integrity/workspace checks passed;
- `RECEIVED`: only use if main intentionally introduces a durable-received-but-not-yet-accepted state;
- `REJECTED`: deterministic consumer rejection after enough of the valid envelope is known to return a matching result safely; no semantic “truth” judgment.

Required recovery tests:

- restart after durable persistence but before response;
- client loses the response and retries exact frozen request/key;
- concurrent duplicate retry;
- idempotency-key conflict;
- Workspace mismatch;
- request/content digest mismatch;
- response always echoes the exact original request SHA.

### CORE-KV2-WP-05 — Cross-repository integration proof

Run a pinned-commit E2E using:

- Knowledge baseline at/after `ddc885f7cfb71dcc2fc94941c971ddea62414fbf`;
- the main-repo V2 receiver branch/commit;
- real HTTP between services;
- real main-repo PostgreSQL;
- Knowledge SQLite persistence/reopen.

Required scenarios:

1. happy-path prepare → submit → accepted → finalized;
2. response loss after Core durable persistence → exact Knowledge retry → deterministic replay without duplicate Core content;
3. Core result persisted by Knowledge, process restarts before Knowledge finalization → no second HTTP request, local finalization only;
4. Knowledge audit/submission evidence corruption fixture → K16 blocks outbound network;
5. Consumer rejection → Knowledge enters operator-review state and does not auto-retry;
6. V1 intake/content E2E continues to pass unchanged.

Completion evidence returned to Knowledge should include:

- final dedicated V2 endpoint path;
- required headers/auth configuration;
- protocol version declaration;
- migrations introduced;
- exact main commit/PR;
- cross-repo fixture hashes/versions;
- CI/E2E run references;
- any supported payload-size limit.

---

## 5. Main-repo non-goals / authority locks

The V2 consumer milestone must **not**:

- change Knowledge K14–K16 retry/reconciliation semantics;
- reuse `/internal/knowledge/ready-packages/intakes` as the V2 delivery endpoint;
- rewrite or migrate the existing V1 consumer as collateral work;
- coerce V2 Content Export into V1;
- fabricate conversion provenance for Vault-origin content;
- treat `ACCEPTED` as legal, trademark, or semantic truth;
- introduce automatic AI interpretation as part of transport ingestion;
- write Knowledge's SQLite/Vault directly;
- allow Knowledge to write Core execution state directly;
- introduce cross-service SQL;
- auto-merge or deploy merely because CI is green.

Core semantic understanding, distillation, recommendation, capability/value logic and downstream product semantics remain separate owner-authorized Core work.

---

## 6. Recommended sequencing

### Knowledge repository

Knowledge can continue its own breadth completion independently in this order:

1. Manual Upload;
2. Local Folder Worker;
3. real attachment/file converter providers;
4. scheduler/change-watch;
5. Admin/operations close-out.

These should reuse the existing architecture and should not reopen K01–K16 contracts without a concrete failing invariant.

### Main repository

When the owner authorizes V2 consumer work:

1. ownership decision + contract/ingress freeze;
2. durable receiver/idempotency;
3. immutable Content Export V2 persistence/provenance;
4. recovery/status semantics;
5. pinned cross-repo E2E;
6. only then configure `MARKORBIT_CORE_V2_DELIVERY_URL` in a real integration environment.

The main repository's current roadmap remains authoritative. This sequence is a dependency order **inside the V2 work**, not authorization to interrupt an already-authorized milestone.

---

## 7. Definition of “Knowledge main body complete” after this review

For planning purposes, use the following wording:

> **MarkOrbit Knowledge's architectural and control-plane main body is complete through K16. The project has entered coverage-completion, production-hardening and cross-repository integration. Remaining work includes several substantive horizontal MVP extensions (Manual Upload, Local Folder, real file converters and scheduling), but no foundational redesign is currently justified. The principal external integration blocker is the absence of a verified ReadyPackage V2 consumer in the MarkOrbit main repository.**

This is the recommended status statement for future handoffs until evidence materially changes.
