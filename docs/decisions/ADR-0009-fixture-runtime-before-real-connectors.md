# ADR-0009: Validate controlled execution with a fixture runtime before real Connectors

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Execution Lifecycle Protocol v1 already locks legal Job transitions, lifecycle reports and terminal evidence. MarkOrbit Knowledge can also register Workers, receive heartbeats and reserve compatible Jobs through leases. The next architectural risk is implementing the runtime boundary correctly:

- when reserved work becomes started work;
- who may write each state;
- how terminal evidence is persisted;
- how duplicate requests are handled;
- what happens when a Worker or lease disappears mid-execution;
- how later Connector implementations remain replaceable.

Connecting Crawl4AI immediately would combine state-machine errors, network behavior, browser behavior, result transport and RawArtifact design in one change. A successful page fetch would not prove that the control plane handles crashes, replay, terminal evidence or unknown outcomes correctly.

## Decision

1. Implement the already locked Execution Lifecycle Protocol v1 before any real Connector runtime.
2. Require Worker credential and lease token for every execution transition.
3. Persist one durable execution attempt plus append-only lifecycle events for each accepted Job attempt.
4. Enforce the locked lifecycle sequence rather than defining a Connector-specific state machine.
5. Treat started-execution lease loss as `FAILED`, not as a safe pending retry.
6. Add a deterministic fixture Connector executor behind a replaceable interface.
7. Restrict the fixture executor to metadata-only evidence and prohibit external I/O.
8. Defer RawArtifact creation and real Crawl4AI integration to later tasks.

## Consequences

### Positive

- Execution lifecycle can be tested without network or browser nondeterminism.
- The runtime consumes the contract instead of redefining it.
- Idempotency and authentication defects are visible before production Connector code exists.
- Crash reconciliation is designed explicitly rather than inferred from queue behavior.
- Connector runtimes receive a narrow declarative contract.
- RawArtifact design remains independent from execution-control evidence.

### Costs

- Task 008 does not yet deliver real collected content.
- `UPLOADING` and `VERIFYING` represent protocol stages without actual object storage.
- Reconciliation remains explicit until a scheduler is designed.
- A production Connector adapter still requires a separate security and dependency review.

## Rejected alternatives

### Connect Crawl4AI directly after Worker leasing

Rejected because browser/network execution would conceal control-plane state and recovery defects.

### Mark a Job complete when a Worker returns success

Rejected because completion requires durable, structured, idempotent evidence rather than a boolean response.

### Return any expired execution to PENDING

Rejected because an external operation may already have happened. Retrying an unknown outcome can duplicate collection, mutation or cost.

### Store fixture output as RawArtifact

Rejected because Task 008 validates execution control, not artifact identity, immutable storage or provenance.
