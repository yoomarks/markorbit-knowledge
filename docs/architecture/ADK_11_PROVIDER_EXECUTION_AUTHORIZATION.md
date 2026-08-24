# ADK-11 Grounded Provider Execution Authorization

## Objective

Define the explicit authority object that must exist between governed PREPARED queue admission and any future paid-provider call.

This slice does **not** connect the authorization object to the ADK-07 worker, does not transition a grounded queue job out of `BLOCKED_EXECUTION`, and does not call DeepSeek, OpenAI, or another provider. It establishes only the protocol and immutable persistence/state-transition boundary needed before such a bridge can be considered.

## Why authorization is separate

The following objects are evidence or scheduling identities, not execution authority:

- `AiGroundedExecutionEnvelopeV1`;
- `AiGroundedPreparedExecutionEvidenceV1`;
- an ADK-07 `GROUNDED_PREPARED` queue job;
- `QUEUED`, `CLAIMED`, or `BLOCKED_EXECUTION` queue state.

None of them may be reinterpreted as permission to spend provider credits or expose provider credentials.

`AiGroundedProviderExecutionAuthorizationV1` is therefore a separately revisioned object. It freezes one exact PREPARED execution identity together with one exact queue job, provider/model selection, repository commit, approval reference, and external gate evidence.

## Frozen authorization identity

Every authorization permanently binds:

- `authorizationId`;
- exact `executionInputSha256`;
- exact ADK queue `queueJobId`;
- Assignment, Binding, SourcePack identity and SourcePack revision;
- exact rendered-prompt SHA-256;
- provider (`DEEPSEEK` or `OPENAI`);
- exact model selector;
- repository commit SHA;
- approval reference;
- ADK-06 acceptance reference fixed to `github:yoomarks/markorbit-knowledge#405`;
- repository-governance reference fixed to `github:yoomarks/markorbit-knowledge#429`;
- request and expiration window, capped at 24 hours;
- `maxProviderCalls = 1`.

External browsing, semantic claim verification, legal-truth verification, candidate auto-activation, and protected actions remain outside this authority and are fixed false.

## Authorization states

### `PENDING`

A new authorization must begin at revision 1 in `PENDING` state.

`PENDING` always has:

- `decisionAt = null`;
- `providerCallAuthorized = false`;
- `executionAuthorityGranted = false`.

A pending object may record that one or both external gates have not yet been satisfied. Merely creating the request cannot authorize execution.

### `GRANTED`

The protocol can represent `GRANTED` only when both fixed external gate facts are recorded satisfied:

- ADK-06 live acceptance issue `#405`;
- repository-governance issue `#429`.

A valid grant also requires a decision timestamp inside the frozen request/expiry window and sets only the provider-call authority fields true.

Protocol representability is not the same thing as current operational authorization. This slice exposes no command, API route, or worker transition that creates or consumes a `GRANTED` object.

### `REVOKED`

A pending or granted authorization may be revoked. Revocation restores provider-call and execution-authority fields to false.

A revoked authorization is terminal. A grant's recorded gate evidence cannot be rewritten by the revocation revision; historical revisions remain immutable for audit. Decision timestamps may not move backward across revisions.

## Persistence state machine

`SqliteAiGroundedProviderExecutionAuthorizationRepository` persists append-only revisions under `BEGIN IMMEDIATE` serialization.

Before every save it resolves the canonical `AiGroundedPreparedExecutionEvidenceV1` by `executionInputSha256` and rejects drift in:

- Assignment identity;
- Binding identity;
- SourcePack identity/revision;
- rendered-prompt SHA-256.

For a given `executionInputSha256 + provider`, only one authorization lineage may exist. Changing `authorizationId` cannot create a second independent one-call budget for the same PREPARED execution/provider pair.

The first revision must be `1/PENDING`. Later revisions must increment by exactly one and preserve the frozen authorization identity. Allowed transitions are:

```text
PENDING -> GRANTED
PENDING -> REVOKED
GRANTED -> REVOKED
REVOKED -> terminal
```

Exact same-revision replay is idempotent. Same-revision mutation, revision gaps, provider/model swaps, commit/approval swaps, competing authorization lineages, evidence-identity drift, decision-time regression, or resurrection of revoked authority are rejected.

## Current repository state

At the time this slice is being developed:

- ADK-06 live 3x2 provider acceptance issue `#405` remains open;
- repository-governance issue `#429` remains open;
- `main` branch protection has not been verified enabled;
- grounded ADK-07 jobs remain fail-closed in `BLOCKED_EXECUTION`;
- no grounded Provider credential is read;
- no grounded Provider call is executed.

Therefore no operational `GRANTED` authorization is being created by this work.

## Next boundary

A future bridge from authorization to execution must be a separate reviewed slice. At minimum it must:

1. resolve the latest authorization revision by immutable identity;
2. prove it is `GRANTED`, inside the frozen authorization window, and not revoked;
3. prove the queue job and PREPARED evidence still match the authorization;
4. consume the one-call budget atomically before provider delivery becomes uncertain;
5. preserve ADK-07 compare-and-set and recovery semantics;
6. keep provider-delivery uncertainty fail-closed;
7. persist exact raw provider response and grounded validation evidence before completion.

That bridge must not be merged or exercised as a paid-provider path while the external gates remain unsatisfied.
