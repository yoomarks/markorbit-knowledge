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

| Current concern | Current location | Classification | Target owner | Migration rule |
| --- | --- | --- | --- | --- |
| HTTP request execution | Knowledge worker runtime | shared transport | `@markorbit/ai` | Move behind generic invocation/provider implementation |
| abort/timeout control | Knowledge worker runtime | shared transport | `@markorbit/ai` | One bounded timeout model; consumer supplies policy value |
| maximum provider response bytes | Knowledge worker runtime | shared transport | `@markorbit/ai` | Generic response-size protection |
| credential lookup/binding | Knowledge adapters | shared transport | `@markorbit/ai` secret boundary | Consumer passes binding/reference/config, never persisted secret |
| canonical provider endpoint | Knowledge adapters | shared provider transport | `@markorbit/ai` provider implementation | Preserve fail-closed endpoint policy |
| provider request body mapping | Knowledge adapters | shared provider invocation | `@markorbit/ai` provider implementation | Generic contract must support current proven input without Knowledge types |
| provider response parsing | Knowledge adapters | shared provider invocation | `@markorbit/ai` provider implementation | Preserve exact raw response in addition to normalized fields |
| provider request ID | Knowledge adapters | shared invocation metadata | `@markorbit/ai` | Optional field; never invent when absent |
| model identity | Knowledge adapters | shared invocation metadata | `@markorbit/ai` | Return actual provider/model identity |
| HTTP 429/5xx retry classification | Knowledge adapters | shared delivery semantics | `@markorbit/ai` | Explicit retryable outcome |
| timeout/network uncertainty | Knowledge adapters | shared delivery semantics | `@markorbit/ai` | Must distinguish ambiguous delivery; do not auto-replay paid calls |
| usage/cost metadata | not consistently available today | shared invocation metadata | `@markorbit/ai` | Optional only; never synthesize |
| `AiKnowledgeAssignmentV1` | Knowledge contracts | Knowledge source semantics | Knowledge | Do not move |
| Knowledge prompt/instruction meaning | Knowledge assignments/SourcePack | Knowledge source semantics | Knowledge | Map into generic invocation input at bridge boundary |
| DeepSeek off-peak paid-execution window | Knowledge live orchestration | acceptance/governance policy | Knowledge/operator governance | Do not bake into generic AI SDK |
| deterministic submission/artifact IDs | Knowledge acquirer | Knowledge source semantics | Knowledge | Preserve after shared invocation returns |
| `AiResearchSubmissionV1` | Knowledge contracts | Knowledge source semantics | Knowledge | Do not move |
| `AiDistilledKnowledgeArtifactV1` | Knowledge contracts | Knowledge source semantics | Knowledge | Do not move |
| prompt/raw/markdown SHA-256 | Knowledge evidence path | Knowledge evidence semantics | Knowledge | Compute/preserve in compatibility bridge |
| exact provider JSON RawArtifact | Knowledge evidence path | Knowledge evidence semantics | Knowledge | Shared Capability returns bytes; Knowledge persists them |
| Markdown derivative + parent lineage | Knowledge evidence path | Knowledge evidence semantics | Knowledge | Do not move |
| CAS/finalization/recovery | Knowledge worker/evidence path | Knowledge durability semantics | Knowledge | Do not move |
| SourcePack / Binding | Knowledge | Knowledge source semantics | Knowledge | Do not move |
| structural citation validation | Knowledge | Knowledge source validation | Knowledge | Do not move |
| PREPARED execution evidence | Knowledge | Knowledge execution/evidence | Knowledge | Do not move |
| provider-execution authorization | Knowledge | governance | Knowledge/operator governance | Do not move into SDK |
| #405 exact-SHA gate | Knowledge live workflow | acceptance/governance only | Knowledge/GitHub governance | Preserve independently of shared SDK |
| #429 branch/secrets/evidence controls | repository administration | governance only | repository administration | Not an AI Capability responsibility |
| provider ranking / legal-truth decision | prohibited | Brain boundary | nowhere in Knowledge/Capability | Must remain absent |

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
