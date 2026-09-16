# MarkOrbit Knowledge System Boundaries

## Ownership

MarkOrbit Knowledge owns acquisition and staging control:

- source registration and collection intent;
- provider routing and declarative job orchestration;
- raw artifact registration, immutability and versioning;
- format conversion orchestration;
- Obsidian Vault transfer and validation;
- Ready Package delivery.

## Execution providers

Mo Crawl and other connectors are replaceable execution providers. They execute constrained collection or conversion requests and return normalized results. They do not own source business policy or MarkOrbit knowledge semantics.

## AI Evidence Plane

Knowledge may execute only bounded, externally authorized AI acquisition and may persist exact provider-response bytes, hashes, provider/model identity, request lineage and other provenance needed to reproduce that acquisition. Those records are evidence, not interpreted truth.

Brain/Method owns research-question strategy, prompt and instruction meaning, synthesis, distillation, semantic conclusions, Assignment Graph/Candidate/Library meaning, recommendations and downstream action authority. Knowledge must not turn AI output into legal truth, semantic truth, provider ranking or autonomous execution authority.

Legacy ADK contracts and runtimes remain readable during migration. Their canonical ownership is frozen by `packages/contracts/src/ai-evidence-plane-owner-map-v1.ts`; compatibility code does not establish ongoing Knowledge ownership. New provider or AI runtime surfaces must enter through the evidence-only seam and be classified by that owner map.

## Current governed Knowledge

Knowledge consumer readiness is projected from one canonical state model: `CURRENT != VERIFIED != CONSUMER_ADMISSIBLE != DELIVERED`. ReadyPackage V1/V2, Brain-ready export, Core content delivery and retrieval channels are adapters; none is authority for Knowledge currentness.

Lexical retrieval explicitly supports private Workspace + Global Public Knowledge overlay. Graph and vector retrieval remain exact-Workspace channels and must advertise that limitation rather than silently changing corpus membership. See `docs/architecture/CURRENT_GOVERNED_KNOWLEDGE.md`.

## Main-repo Knowledge integration bridge

The main MarkOrbit repository path `services/knowledge` is an **integration bridge**, not a second Knowledge domain owner. Its stable service identity exists for bounded provenance-query / ready-package-consumption compatibility and transport integration. New Evidence Plane persistence, source ownership, currentness or health/readiness authority belongs in `markorbit-knowledge`.

## Obsidian

Obsidian is the default Knowledge Staging implementation. The durable integration boundary is Markdown, YAML properties, Wiki Links, attachments and file/Git history. Core protocols must not depend on an optional Obsidian community plugin.

## Cross-system cognitive and execution ownership

MarkOrbit Core owns authenticated Workspace/Principal authority, shared bounded context/business semantics, and Knowledge intake/delivery governance. Core does not own Knowledge evidence currentness or replace Brain/Method/Capability domain ownership.

Brain owns derived/resolved operational intelligence, interpretation, confidence and cognitive gaps. Method owns versioned reasoning-method meaning, applicability, evaluation, limitations and selection semantics. Capability owns stable outcome contracts, implementation binding/admission, governed invocation and protected execution semantics.

Cordis is a planned Workspace-local/private personalization overlay. It is not currently a canonical runtime owner or health/readiness authority and must not redefine Knowledge evidence, Core identity, shared Brain/Method canon or Capability permissions.

The full decision/status hierarchy and owner map is frozen in `docs/architecture/K0_HEALTH_READINESS_TAXONOMY_AND_OWNER_MAP.md`.

## Worker security

Central services may send only declarative, schema-validated tasks. Arbitrary shell, Python, PowerShell, JavaScript or binary execution from remote task payloads is forbidden.

## Raw artifact invariant

Raw artifacts are immutable evidence. Content changes create a new version; they never overwrite the earlier artifact. Derived Markdown and previews must retain provenance back to the raw version.

## Workspace authority and Knowledge namespace

MarkOrbit Core owns authenticated Workspace identity, membership and product lifecycle. Core Workspace IDs are UUIDs and must remain the authority used to authenticate and authorize product access.

Knowledge Schema v1 `Workspace` owns a separate `wsp_<ULID>` data-boundary namespace for Knowledge persistence, acquisition, staging and retrieval. Browser or service access authorized by a Core Workspace must resolve through a durable Core-to-Knowledge binding before reading or mutating Knowledge-owned records. Missing or ambiguous bindings fail closed.

Knowledge Workspace lifecycle state gates local Knowledge availability only. It does not create, activate, suspend, archive or otherwise redefine the corresponding Core Workspace or its memberships. Global Public Knowledge is platform-owned and is never an implicit fallback for an unbound tenant Workspace.
