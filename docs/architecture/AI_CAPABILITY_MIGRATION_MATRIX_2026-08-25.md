# AI Capability Migration Matrix — 2026-08-25

Status: **K-CAP-AI-001 Knowledge-side audit complete / main-repo implementation handoff ready**

Repositories audited:

- `yoomarks/markorbit-knowledge@a5fef459a5a681e2f7159971c87374c6625f4776`
- `yoomarks/markorbit` current `main`, especially `packages/ai`

## Verified facts

`yoomarks/markorbit/packages/ai/src/index.ts` is currently only a thin package marker. It does not yet implement provider transport, invocation, delivery classification, or response envelopes.

Knowledge currently contains the proven provider implementations. In particular:

- `packages/worker-runtime/src/ai-distilled-knowledge-acquirer.ts` owns the DeepSeek HTTPS transport, timeout/response-size bounds, credential lookup, provider request/response mapping, provider error classification, and Knowledge source-record construction.
- `packages/worker-runtime/src/openai-knowledge-adapter.ts` owns a second generic HTTPS transport/timeout/error path for OpenAI Responses plus OpenAI-specific request/response mapping.
- both adapters return exact raw provider bytes so the Knowledge evidence path can hash and persist authoritative source evidence.

The migration must therefore extract reusable invocation capability without moving KnowledgeAssignment, SourcePack, RawArtifact, or Knowledge source semantics into Core.

## Frozen migration matrix

### Shared transport and provider invocation -> `@markorbit/ai`

- **HTTP request execution.** Move the generic network call behind the shared Capability.
- **Abort and timeout control.** Use one bounded timeout model; the consumer may supply the policy value.
- **Maximum provider response bytes.** Keep generic response-size protection in the Capability.
- **Credential lookup and binding.** Keep provider secrets inside the shared runtime boundary; consumers must not persist the secret value.
- **Canonical provider endpoint.** Provider implementations keep fail-closed endpoint policy.
- **Provider request mapping.** The generic contract must cover current proven provider inputs without importing Knowledge types.
- **Provider response parsing.** Preserve exact raw provider response in addition to normalized fields.
- **Provider request ID.** Return it when the provider supplies it; never invent it.
- **Model identity.** Return actual provider/model identity.
- **HTTP 429/5xx classification.** Represent retryability explicitly.
- **Timeout/network uncertainty.** Represent ambiguous delivery explicitly and never auto-replay an ambiguous paid call.
- **Usage/cost metadata.** Keep optional; never synthesize unavailable values.

### Knowledge source semantics -> remain in Knowledge

- `AiKnowledgeAssignmentV1`.
- Knowledge prompt and instruction meaning.
- deterministic submission/artifact IDs.
- `AiResearchSubmissionV1`.
- `AiDistilledKnowledgeArtifactV1`.
- prompt/raw/Markdown SHA-256 identities.
- exact provider JSON RawArtifact persistence.
- Markdown derivative and parent lineage.
- CAS/finalization/recovery.
- SourcePack / Binding.
- structural citation validation.
- PREPARED execution evidence.

The shared Capability returns provider execution evidence; Knowledge remains responsible for turning it into durable Knowledge source records and provenance.

### Acceptance/governance-only -> do not move into the shared SDK

- DeepSeek off-peak paid-execution window policy.
- provider-execution authorization.
- issue #405 exact-SHA acceptance gate.
- issue #429 repository/secrets/evidence governance.

### Prohibited semantics -> remain absent

- provider ranking;
- legal-truth certification;
- Brain conclusions or recommendations.

## Minimal AI Invocation V1 required from `@markorbit/ai`

The shared contract should be no larger than current consumers prove necessary:

```text
AiInvocationRequestV1
- requestId
- provider
- model
- input/messages
- provider options needed by current providers
- timeoutMs
- maxResponseBytes
- credential/account binding reference or provider runtime configuration

AiInvocationResultV1
- requestId
- provider
- model
- startedAt / completedAt
- delivery outcome
- retry classification
- delivery uncertainty
- providerRequestId?
- normalized output?
- exactResponseBytes / exactResponseBody
- response content type/status metadata
- usage?
- cost?

AiInvocationErrorV1
- stable generic code
- retryable
- deliveryUncertain
- provider/status metadata when safe
```

`KnowledgeAssignment`, `SourcePack`, `Expert`, `Case`, legal-truth state, Brain instructions, candidate promotion, RawArtifact, and CAS are explicit non-goals.

## First-provider migration recommendation

Migrate **OpenAI first**.

Reason:

1. its adapter has no Knowledge-specific paid-window policy;
2. it already uses a clean Responses request/response mapping;
3. the duplicated HTTP/timeout/error implementation can be removed from the OpenAI path after parity;
4. DeepSeek can then validate that provider-specific cost-window governance remains outside the shared SDK.

## Compatibility bridge acceptance

The Knowledge bridge is accepted only when deterministic tests prove that shared invocation preserves:

- assignment identity;
- prompt identity;
- exact raw provider response bytes;
- provider/model/request IDs;
- retry vs delivery-uncertain classification;
- Knowledge submission/artifact deterministic identity;
- RawArtifact/CAS lineage;
- no legal-truth or provider-ranking output.

No current Knowledge generic transport may be deleted before both current providers have parity through the shared capability.

## Cross-repository write boundary

This audit was performed while the active takeover authorization is for `markorbit-knowledge`. The main repository is therefore treated as read-only for this stage. The next main-repo task is K-CAP-AI-002/003: implement the V1 contract and first OpenAI provider in `yoomarks/markorbit/packages/ai`, then return an exact commit/PR for the Knowledge compatibility bridge.
