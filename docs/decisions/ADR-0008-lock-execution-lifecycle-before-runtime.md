# ADR-0008: Lock the execution lifecycle before Connector runtime

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

MarkOrbit Knowledge can now register Workers, accept heartbeats and atomically lease compatible pending Jobs. The next architectural risk is allowing a Worker or Connector implementation to define execution progress and terminal behavior implicitly.

Without a locked lifecycle contract, the first runtime could accidentally become the source of truth for:

- Job transition rules;
- progress payload shape;
- failure classification;
- terminal idempotency;
- CollectionRun status derivation;
- output metadata;
- security boundaries.

That would couple the control plane to Crawl4AI or another Connector before RawArtifact ingestion and storage are designed.

## Decision

Create Execution Lifecycle Protocol v1 as a contract-only layer before implementing a Connector runtime.

The protocol:

1. accepts only reports for Jobs already protected by Worker authentication and an active lease;
2. defines the legal transition chain from `LEASED` through terminal execution states;
3. keeps progress reports declarative and structured;
4. defines terminal completion and failure payloads;
5. carries output summaries and hashes only, not files or RawArtifacts;
6. rejects unknown and secret-bearing fields;
7. derives the current single-Job CollectionRun state from Job state;
8. leaves retry creation, artifact ingestion and Connector invocation to later tasks.

## Consequences

### Positive

- Connector runtimes remain replaceable.
- Crawl4AI cannot redefine the control-plane state machine.
- Worker and server implementations can share strict validators.
- RawArtifact design remains an independent immutable-evidence decision.
- Terminal behavior and retry boundaries are explicit before execution code exists.

### Costs

- Real execution remains unavailable after this task.
- A later persistence task must add an append-only event ledger and transactional state mutation.
- A future multi-Job CollectionRun model will require a new aggregation policy.

## Rejected alternatives

### Start with Crawl4AI and infer the state machine from its callbacks

Rejected because an external dependency would define internal orchestration semantics.

### Reuse Worker heartbeat payloads for progress

Rejected because heartbeat describes Worker health, while execution events describe one leased Job and require independent sequencing and audit history.

### Create RawArtifacts directly from completion reports

Rejected because lifecycle metadata is not immutable source evidence and must not bypass artifact registration, provenance and storage verification.

### Implement retry immediately

Rejected because failure reporting and retry policy are separate concerns. The v1 `retryable` field is descriptive and cannot create another attempt.
