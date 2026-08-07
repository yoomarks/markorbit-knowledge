# ADR-0011: Conversion Runtime authorization and leases

## Status

Accepted.

## Context

ConversionRun ledger work made conversion intent durable, pending-only dispatchable and immutable, but runtime authority remained undefined. Reusing Collection Job leases directly would mix connector execution semantics with converter execution semantics and would make RawArtifact read and staging upload grants ambiguous.

## Decision

We will lock Conversion Runtime Protocol v1 as a metadata-only contract. Existing Worker identity, credentials, heartbeat, health and desired state are reused. Conversion-specific capability, lease, attempt, claim, report, RawArtifact read grant, staging upload grant and lease-loss classifications are separate.

Workers declare exact converter versions only. Claims bind PENDING runs to one active lease and one attempt. Runtime reports require Worker credential identity, lease tokenReference/tokenDigest, generation, Attempt, Run and expected status. Workers may report start, progress, output ready, verification ready or failed, but cannot report COMPLETED. Completion is reserved for a control-plane verifier that validates READY staging evidence.

## Consequences

- No second Worker Registry is introduced.
- ConversionRun is not modeled as a Collection Job.
- JobLease persistence and reconciliation remain unchanged.
- Lease-loss before STARTED is reclaimable with evidence; lease-loss after STARTED fails the Run with `LEASE_EXPIRED_DURING_CONVERSION` and no automatic retry.
- Input bytes and output Markdown move only through grants, never through lease/report payloads.
- Future fixture converter execution remains bounded and deterministic but is not implemented by this ADR.

## Non-goals

No persistence, migrations, runtime API, converter invocation, Markdown/YAML generation, RawArtifact download runtime, staging upload runtime, scheduling, retry, Obsidian, Ready Package or MarkOrbit Core behavior is implemented.
