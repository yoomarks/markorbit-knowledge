# AI Production Pilot Acceptance V1

Status: **governed implementation acceptance defined; live provider evidence pending**

This document defines the evidence required before MarkOrbit Knowledge may state that the ADK-06 3-topic × multi-provider production pilot has actually completed.

## Implementation acceptance

The implementation is acceptable when repository CI proves that:

- a pilot plan contains exactly three distinct durable KnowledgeAssignment ids;
- a pilot plan contains at least two distinct providers;
- the plan carries an explicit approval reference and live-provider-call authorization;
- every Assignment/provider cell produces one explicit receipt;
- a cell can be `EXECUTED`, `BLOCKED_ADAPTER`, `BLOCKED_CREDENTIAL` or `FAILED`;
- only a successful real adapter acquisition can produce `EXECUTED`;
- missing provider adapters cannot be silently skipped;
- missing runtime credentials cannot be represented as success;
- the runner does not rank providers, verify legal truth or activate Assignment Candidates.

Deterministic fake adapters are valid only for implementation CI. They are not live production evidence.

## Live production acceptance

A live pilot is complete only when all intended matrix cells meet all of these conditions:

1. the selected pilot plan was explicitly approved and frozen before execution;
2. the three Assignment ids resolve to durable immutable KnowledgeAssignments;
3. every selected provider has a real provider adapter, not a test double;
4. every selected provider has its required runtime credential available without persisting the secret in Knowledge contracts, artifacts or logs;
5. every intended Assignment/provider cell returns an `EXECUTED` receipt;
6. every `EXECUTED` receipt references a real `AiResearchSubmissionV1` and `AiDistilledKnowledgeArtifactV1`;
7. each exact provider response is preserved as primary acquisition evidence;
8. each Markdown derivative preserves explicit lineage to its raw provider response through the existing RawArtifact boundary;
9. no `BLOCKED_ADAPTER`, `BLOCKED_CREDENTIAL` or `FAILED` cell is hidden or reclassified as success;
10. no provider ranking, legal-truth conclusion or candidate auto-activation is produced by the pilot layer.

If any intended cell is blocked or failed, the live pilot remains incomplete even if other cells executed successfully.

## Current evidence state

The codebase currently has a real DeepSeek adapter gated by runtime `DEEPSEEK_API_KEY`. Other named providers require real adapters before they can satisfy live multi-provider acceptance. Repository CI uses deterministic adapters to prove orchestration semantics and therefore must never be cited as evidence that an external provider was actually called.

A future live acceptance record should preserve the frozen pilot id, approval reference, exact assignment ids, provider list, run id, per-cell receipts, submission/artifact ids and RawArtifact lineage references. It must not persist provider secrets.
