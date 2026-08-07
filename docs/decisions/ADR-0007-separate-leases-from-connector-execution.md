# ADR-0007: Separate Job lease ownership from Connector execution

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

The execution ledger can durably record pending CollectionRuns and Jobs, but no authorized runtime can reserve work. Directly adding Crawl4AI execution at this point would combine authentication, scheduling, lease recovery, Connector invocation, output upload and execution evidence into one change.

A clear boundary is required between:

- the control plane deciding which Worker may reserve which Job;
- the execution plane actually invoking a Connector and producing evidence.

## Decision

1. Introduce Worker Protocol v1 as a contract namespace separate from Schema v1 and Execution Contract v1.
2. Add a durable Worker Registry with exact JobType, Connector version and Capability declarations.
3. Provision cryptographically random Worker credentials and store only digests.
4. Require authenticated, fresh heartbeat evidence before claims.
5. Represent reservation through a durable JobLease with a one-time lease token.
6. Permit only `PENDING ↔ LEASED` Job transitions in this phase.
7. Keep the parent CollectionRun `PENDING` while work is merely leased.
8. Keep Connector invocation, Crawl4AI, RawArtifact upload and completion evidence outside this boundary.
9. Reclaim abandoned work through deterministic lease expiry and explicit or claim-time reap.
10. Keep independent Worker and Mo Crawl processes outside the administration application.

## Consequences

### Positive

- Worker authentication and ownership are testable without executing external code.
- Concurrent claims have a single transactional winner.
- Abandoned work can safely return to `PENDING` without creating false retries.
- Exact Connector-version compatibility remains auditable.
- Future Connector runtimes receive a stable lease boundary.
- UI language can distinguish queued, reserved, running and completed states honestly.

### Costs

- A leased Job still requires a later execution protocol before useful collection occurs.
- Worker credentials and lease tokens introduce operational secret handling.
- Heartbeat freshness and lease durations require deployment tuning.
- SQLite claim serialization is a reference implementation, not the final horizontally scaled queue.

## Rejected alternatives

### Treat `LEASED` as `RUNNING`

Rejected because reservation is not proof that Connector execution started.

### Embed Worker code in the administration process

Rejected because it collapses the control and execution planes and increases the blast radius of browser automation and local-file access.

### Send shell commands in Job payloads

Rejected because Worker tasks must remain declarative and bounded by reviewed Connector manifests.

### Store plaintext credentials or lease tokens

Rejected because registry reads, backups and logs must not expose reusable secrets.

### Depend on a background scheduler for expiry

Rejected for this phase. Explicit and claim-time reaping provide deterministic recovery without introducing another service.
