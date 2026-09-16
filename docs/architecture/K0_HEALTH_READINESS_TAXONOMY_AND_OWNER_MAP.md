# K0 Health / Readiness Taxonomy and Owner Map

Status: **K0-5 canonical owner/status map**
Issue: `#761`
Baseline: K0 seams `#757`–`#760`

## Purpose

MarkOrbit Knowledge has many operational projections, but they do not form one interchangeable "health" state. This document freezes the hierarchy, decision authority, evidence requirements and cross-system ownership so UI/API consumers do not create competing truth.

The governing rules are:

1. **raw facts are not health states**;
2. **subsystem diagnostics describe a bounded workflow and do not authorize unrelated action**;
3. **canonical rollups answer one named decision question only**;
4. **consumer admissibility is not operational health**;
5. **delivery success is not currentness or semantic truth**;
6. **platform aggregation is not a replacement for the narrower owner projections**;
7. **non-healthy decision states must remain explainable through reason codes, gaps, issues or durable evidence pointers**.

No new runtime state machine is introduced by K0-5.

## Canonical hierarchy

```text
L0  Durable execution/evidence facts
    Source / Plan / Run / Job / Lease / RawArtifact / Staging / Retrieval / Audit / Binding
                         |
L1  Subsystem diagnostics
    Collection Health | Review/Assignment Health | Campaign Progress | Production Validation
                         |
L2  Evidence-supply rollups
    Source Supply Health -> Evidence Supply Health
                         |
L3  Purpose-specific readiness gates
    Foundational Readiness | Operations Readiness | Storage Operating Envelope
                         |
L4  Consumer evidence gate
    Current Governed Knowledge: CURRENT != VERIFIED != CONSUMER_ADMISSIBLE != DELIVERED
                         |
L5  Delivery/reliability observation
    Producer -> Core Reliability + append-only delivery evidence
                         |
L6  Platform operations portfolio
    cross-Workspace factual aggregation; no new global semantic health state
```

## Projection authority matrix

| Projection                            | Class                                  | Inputs / evidence                                                                                | Scope                          | Canonical decision                                                                        | Explainability                                                                                           |
| ------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Source Collection Health              | subsystem diagnostic                   | CollectionRun, Job retry/failure, default CollectionPlan, scheduler state                        | Source                         | Is this source collection workflow running/recovering/failing/overdue?                    | alerts carry code, severity, timestamps; latest failure is durable execution evidence                    |
| Source Supply Health                  | canonical operational rollup           | source registration, runs, RawArtifacts, staging, retrieval, freshness, compatibility            | coverage target                | Is the target operationally supplied through acquisition → retrieval?                     | `gaps[]`, freshness, compatibility error/provenance                                                      |
| Evidence Supply Health                | canonical evidence-supply rollup       | Source Supply + coverage contract + schedules + 30d reliability + latency + change activity      | coverage target / Workspace    | Is expected evidence supply objectively healthy and explainable now?                      | mandatory `reasonCodes[]` for non-healthy causes plus underlying facts                                   |
| Foundational Readiness                | purpose-specific gate                  | Source Supply + retrieval quality audit + retrieval relevance audit                              | jurisdiction / target set      | Is the declared foundational corpus ready for this jurisdiction?                          | target `stage`, `gaps[]`, `reason`, quality/relevance gaps                                               |
| Operations Readiness                  | purpose-specific gate                  | source/worker/run/job/lease/conversion/scheduler/ReadyPackage/delivery ledgers                   | Workspace                      | Can operators safely operate the current Knowledge pipeline, and what action is required? | `issues[]` with code, severity, count, action and drill-through `href`                                   |
| Source Intelligence Review Health     | subsystem diagnostic                   | current review queue, evidence-state history, persisted review events                            | review queue                   | What is the review backlog/age/recurrence shape?                                          | descriptive attention items and event evidence; explicitly non-authorizing                               |
| Source Intelligence Assignment Health | subsystem diagnostic                   | current ownership queue + bounded ownership events                                               | review queue/operator workload | What is the observed assignment/backlog shape?                                            | item/operator metrics; explicitly not staffing capacity or routing policy                                |
| Web Acquisition Campaign Progress     | subsystem diagnostic                   | campaign Source/Run/Artifact/Conversion/Retrieval facts and receipt accounting                   | campaign                       | How far has this acquisition campaign progressed?                                         | per-source run/failure codes and factual counters; no overall health state                               |
| Production Validation Scorecard       | acceptance diagnostic                  | onboarding, execution, pipeline, compatibility, structured-remediation telemetry                 | validation wave                | What has actually been observed during production validation?                             | per-target telemetry/failure classification; unknown fields stay `null`; no action authority             |
| Producer -> Core Reliability          | delivery diagnostic                    | staging verification/finalization, canonical promotion, ReadyPackage, append-only delivery audit | Workspace/window/binding       | How reliably does governed evidence progress into Core delivery?                          | exact funnel/rates/latencies and reconciliation drill-through to audit evidence                          |
| Current Governed Knowledge            | canonical consumer gate                | current retrieval selection, verification, lifecycle, corpus visibility, delivery evidence       | document/channel/Workspace     | May this exact evidence version be exposed to this consumer now?                          | bounded `reasonCodes[]`; four states remain independent                                                  |
| Storage Operating Envelope            | purpose-specific platform/storage gate | DB/WAL/free-page/frontier metrics + backup/restore evidence                                      | Knowledge storage              | Is SQLite still inside the measured operating envelope?                                   | threshold reason codes; migration review never auto-authorizes migration                                 |
| Platform Operations Portfolio         | platform factual aggregate             | Workspace/source/run/lease/backlog/currentness/retention/URL/storage facts                       | platform                       | What is the bounded operational situation across Knowledge now?                           | preserves component facts and Storage Envelope result; intentionally has no global semantic health state |

### Canonical rollup rule

A projection is "canonical" only for the decision named in the table. `READY` in Source Supply cannot substitute for `consumerAdmissible=true`; `Operations Readiness=READY` cannot prove a foundational corpus is ready; a successful delivery cannot make a document current.

## Decision-context routing for UI and API consumers

Use the narrowest authoritative projection that answers the decision:

| Decision context                                            | Use                                             | Do not substitute                                           |
| ----------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Source collector troubleshooting / overdue checks           | Source Collection Health                        | Evidence Supply or platform totals                          |
| Target acquisition → retrieval availability                 | Source Supply Health                            | Collection latest-run status alone                          |
| Evidence-supply situation room / expected artifact coverage | Evidence Supply Health                          | hidden score, Source Intelligence review health             |
| Foundational corpus release for a jurisdiction              | Foundational Readiness                          | Source Supply `READY` alone                                 |
| Workspace operator safety / backlog remediation             | Operations Readiness                            | Platform Operations Portfolio totals                        |
| Review backlog triage                                       | Source Intelligence Review Health               | evidence freshness or legal quality                         |
| Assignment workload inspection                              | Source Intelligence Assignment Health           | automatic routing/staffing policy                           |
| One bulk-web campaign                                       | Web Acquisition Campaign Progress               | platform backlog or Source Supply                           |
| Production acceptance evidence                              | Production Validation Scorecard                 | runtime authorization or permanent source health            |
| Core handoff/reconciliation                                 | Producer -> Core Reliability and delivery audit | Knowledge currentness                                       |
| Evidence exposure to Brain/Core/retrieval adapter           | Current Governed Knowledge                      | ReadyPackage status, delivery success, Operations Readiness |
| SQLite capacity / backup / restore posture                  | Storage Operating Envelope                      | generic platform `READY` label                              |
| Executive/operator cross-Workspace overview                 | Platform Operations Portfolio                   | any new global "Knowledge health" state                     |

API/UI surfaces must retain these labels. A consumer may summarize multiple projections visually, but it must not collapse them into an undocumented red/amber/green state that becomes a competing authority.

## Reason-code and evidence rule

Decision-level non-healthy states require an explainable path:

- Source Supply: `gaps[]` plus freshness/compatibility evidence;
- Evidence Supply: `reasonCodes[]` plus coverage/schedule/reliability facts;
- Foundational Readiness: target `stage`, `reason`, supply/quality/relevance gaps;
- Operations Readiness: `issues[]` with code/severity/count/recommended action/`href`;
- Current Governed Knowledge: bounded admissibility `reasonCodes[]`;
- Storage Operating Envelope: threshold reason codes and measured values.

Diagnostics that do not expose a single decision state remain diagnostics. Their raw counters, attention rows, failure codes, telemetry or audit drill-through are evidence pointers; they must not acquire action authority merely because a UI colors them.

If a future decision-level rollup cannot explain a non-healthy result with bounded reason/evidence, it is incomplete and must not become a gate.

## Evidence Plane vs Cognitive Plane

K0-5 preserves the owner seam frozen by issue `#758` and `AI_EVIDENCE_PLANE_BOUNDARY_V1.md`:

```text
Knowledge Evidence Plane
  exact source/provider evidence + provenance + versions + objective operational projections
        |
        v
Brain / Method Cognitive Plane
  interpretation + resolution + synthesis + distillation + method meaning
        |
        v
Capability execution plane
  governed implementation binding + invocation + outcome/receipt
```

Health/readiness does not change this direction. Evidence Supply may report completeness, freshness, failures and known limitations; it must not infer legal truth, source value, semantic correctness, recommendation quality or professional fitness.

`CURRENT != VERIFIED != CONSUMER_ADMISSIBLE != DELIVERED` remains a separate evidence-control invariant:

- `CURRENT` selects the Knowledge version;
- `VERIFIED` records acceptable verification evidence;
- `CONSUMER_ADMISSIBLE` is the Knowledge-side exposure gate;
- `DELIVERED` is downstream transport evidence.

Brain or Core acceptance cannot rewrite Knowledge currentness. Conversely, Knowledge readiness cannot create Brain interpretation or Capability action authority.

## Cross-system owner map

| Owner                          | Canonical responsibility                                                                                                                                                                                             | Explicit non-ownership                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markorbit-knowledge`          | Knowledge Evidence Plane: source acquisition, RawArtifact/staging/retrieval lineage, evidence versions, evidence supply/currentness/admissibility, Evidence Sets, governed export and evidence-side delivery records | cognitive interpretation, professional method meaning, Core Workspace identity, generic provider/tool infrastructure, product business truth                     |
| main-repo `services/knowledge` | **Integration Bridge**: stable main-repo service identity for bounded provenance query / ready-package consumption compatibility and transport integration                                                           | second Knowledge domain, source registry, evidence database, currentness/readiness authority                                                                     |
| Core                           | authenticated Workspace/Principal authority, shared bounded context/business semantics, Knowledge intake/delivery governance                                                                                         | Knowledge evidence currentness, Brain cognition, provider/tool implementation meaning                                                                            |
| Brain                          | derived/resolved operational intelligence, interpretation, confidence, cognitive gaps and reusable reasoning assets                                                                                                  | source/evidence truth, official truth, external action execution                                                                                                 |
| Method                         | versioned reasoning-method meaning, applicability, evaluation, limitations, lineage and method-selection semantics                                                                                                   | acquisition evidence ownership, provider transport, permission/action authority                                                                                  |
| Capability                     | stable outcome contracts, implementation binding/admission, governed invocation, outcome/evidence/session receipts and protected execution policy                                                                    | professional meaning of evidence/methods, canonical Knowledge evidence, Brain cognition                                                                          |
| Cordis                         | planned Workspace-local/private personalization overlay for user/org preferences, local experience and private skills/policies                                                                                       | any canonical Evidence Plane, Core identity, shared Brain/Method canon or Capability permission authority; no canonical health/readiness projection exists today |

### Main-repo Knowledge bridge naming rule

The main-repo path remains `services/knowledge` for compatibility. Physical rename is not justified by K0-5 because service/package/port identity may be depended on by integration and deployment code.

Its documentation and package description must call it a **Knowledge Integration Bridge**. New domain logic, persistence or health/readiness authority belongs in `markorbit-knowledge`, not in that shell. If the bridge later gains transport adapters, they must consume explicit Knowledge contracts rather than recreate Evidence Plane state.

## Platform operations relationship

`PlatformOperationsPortfolio` from K0-4 is the top factual aggregation for operators. It includes Workspace/source/run/lease/backlog/currentness/retention/acquisition/storage facts and embeds the Storage Operating Envelope assessment.

It intentionally does **not** publish a single platform `HEALTHY/READY` state. Doing so would collapse several independent authorities and make the platform aggregate a competing truth source. Consumers that need a decision must drill to the appropriate model above.

Likewise, Operations Readiness is Workspace-scoped and actionable; it is not a cross-Workspace executive health score. Storage Operating Envelope is a capacity/recovery gate; it is not evidence quality. Foundational Readiness is corpus-purpose readiness; it is not transport reliability.

## Adding or changing a health/readiness projection

A new projection is allowed only when all of the following are explicit:

1. the exact decision question it answers;
2. durable input facts and their owners;
3. scope (source, target, campaign, jurisdiction, Workspace, platform, etc.);
4. whether it is a diagnostic or canonical rollup/gate;
5. bounded non-healthy reason/evidence semantics when it can block a decision;
6. consumers and API/UI label;
7. proof that an existing projection cannot answer the same decision without semantic distortion.

A new projection must not:

- infer legal or semantic truth from operational success;
- make review/assignment workload into scheduling authority;
- make a production-validation observation into runtime authorization;
- promote delivery success into currentness;
- turn platform aggregation into a universal Knowledge health score;
- move Cognitive Plane interpretation into Knowledge.

## K0 convergence result

After `#757`–`#761`, the stable seams are:

- Core Workspace UUID authority → durable binding → private Knowledge `wsp_*` namespace;
- Knowledge Evidence Plane → Brain/Method Cognitive Plane;
- one governed-current consumer model with explicit corpus capabilities;
- executable retention/acquisition lifecycle and bounded platform operations;
- this single health/readiness hierarchy and owner map.

Future development should extend these seams rather than creating parallel authority.

## Runtime owner and consumer registry

This registry completes the model map with concrete owners and current consumers. File paths identify implementation ownership; UI/API names identify where the projection is consumed today.

| Projection                            | Runtime owner                                                                      | Current primary consumers                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Source Collection Health              | Knowledge Admin server (`apps/admin/src/server/source-collection-health.ts`)       | `/api/sources`; Sources/Admin collection diagnostics                                                  |
| Source Supply Health                  | Knowledge Persistence (`packages/persistence/src/source-supply-health.ts`)         | `/api/source-supply-health`; Foundational Supply Health Workbench; Operator Inbox/remediation readers |
| Evidence Supply Health                | Knowledge Persistence + Control Plane owner projection                             | Source Coverage board; `/api/internal/control-plane/evidence-supply-health`; Control Plane federation |
| Foundational Readiness                | Knowledge Worker Runtime (`packages/worker-runtime/src/foundational-readiness.ts`) | Foundational remediation queue/operator workbench and worker readiness checks                         |
| Operations Readiness                  | Knowledge Persistence (`packages/persistence/src/operations-readiness.ts`)         | `/api/operations/readiness`; Dashboard/Overview Operations Readiness panel                            |
| Source Intelligence Review Health     | Knowledge Worker Runtime + Admin review service                                    | `/api/source-intelligence/reviews/health`; Source Intelligence review-health UI                       |
| Source Intelligence Assignment Health | Knowledge Worker Runtime + Admin review service                                    | `/api/source-intelligence/reviews/assignment-health`; assignment/capacity UI                          |
| Web Acquisition Campaign Progress     | Knowledge Admin server                                                             | `/api/web-acquisition/campaigns/[campaignId]/progress`; bulk-web operator tooling                     |
| Production Validation Scorecard       | Knowledge Persistence + Admin production-validation wave                           | `/api/discovery/production-validation-wave`; production-validation audit/closeout tooling             |
| Producer -> Core Reliability          | Knowledge Persistence + Admin reliability service                                  | `/api/knowledge/reliability`; delivery drill-through API; Dashboard reliability panel                 |
| Current Governed Knowledge            | Knowledge Contracts + Persistence projection                                       | Brain-ready export, ReadyPackage/Core content export, retrieval-channel consumers                     |
| Storage Operating Envelope            | Knowledge Persistence                                                              | Platform Administration owner view; K0-4 operations runbook/benchmark decisions                       |
| Platform Operations Portfolio         | Knowledge Persistence + Control Plane owner projection                             | `/api/internal/control-plane/platform-administration`; Control Plane platform administration          |

The main-repo `services/knowledge` bridge consumes explicit Knowledge contracts only; it is not the runtime owner of any model in this registry.
