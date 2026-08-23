# ADK-09 Governed Proposition Promotion

## Objective

ADK-09 closes the governance gap between evidence-backed `AiAssignmentCandidateV1` proposals and the durable Assignment Library introduced in ADK-08.

The growth path is:

`evidence -> Assignment Candidate -> explicit approval -> KnowledgeAssignment -> Assignment Graph revision -> Assignment Library revision`

A candidate is never executable merely because it exists. Promotion is an explicit operator action with a durable approval reference.

## Promotion invariants

1. The candidate must already be durable and evidence-backed.
2. The candidate's bound Assignment Graph revision must still be the latest graph revision. A stale candidate is rejected and must be reconsidered against the new topology.
3. The approved base Assignment Library revision must still be latest. Promotion never silently appends to a newer library than the operator reviewed.
4. Candidate, graph and library must share the same jurisdiction and domain.
5. Promotion creates one immutable `KnowledgeAssignment` from the candidate proposition and instruction-set binding.
6. Promotion advances the graph by exactly one revision, adding the promoted Assignment as `FOLLOW_UP` and preserving the candidate's proposed relation.
7. Promotion advances the library by exactly one revision and appends the Assignment under an explicitly approved workflow and tag set.
8. Candidate evidence references are preserved in the new graph revision's `triggerEvidenceRefs`.
9. One candidate may have at most one promotion receipt. Exact replay is idempotent; reinterpretation under a different approval is rejected.
10. Promotion does not enqueue an ADK-07 job, invoke a provider, verify legal truth, rank providers, authorize a protected action, or recursively promote another candidate.

## Durable receipt

`AiAssignmentCandidatePromotionV1` records:

- promotion id;
- candidate id;
- approval reference and approving operator identity;
- promoted Assignment id;
- exact base/resulting graph revisions;
- exact base/resulting library revisions;
- workflow and tags;
- promotion timestamp;
- permanent no-auto-approval, no-execution-authority and no-legal-truth boundaries.

The receipt is the audit bridge from discovery to governed proposition-library growth.

## Recovery model

The promotion operation is deterministic from a frozen plan. Assignment, graph and library registries are immutable and idempotent. If a process stops after a durable intermediate write but before the receipt is stored, rerunning the exact same frozen plan can complete the remaining writes. Once a receipt exists, only an exact replay is accepted.

## Operator command

Use the worker command:

```bash
pnpm --filter @markorbit/worker adk:candidate:promote
```

Required environment variables:

- `MARKORBIT_ADK_LIBRARY_DB_PATH`: durable Knowledge SQLite database.
- `MARKORBIT_ADK_PROMOTION_PLAN_PATH`: frozen JSON promotion plan.

The plan contains only governance and classification inputs. Provider credentials are neither required nor accepted by this path.
