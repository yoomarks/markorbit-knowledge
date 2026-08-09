# M22 Foundational Readiness Workbench

## Purpose

M22 turns the M21 read-only foundational remediation snapshot into an operator-facing Admin workbench without changing any collection, evidence, conversion, indexing, remediation, or legal-judgment boundary.

The page is available at `/foundational` and is backed only by:

`GET /api/foundational/remediation-queue?workspaceId=...&jurisdiction=US|WO&topK=5`

## Operator view

The workbench provides:

- US / WIPO jurisdiction switching;
- readiness percentage and READY target count;
- blocking and actionable target counts;
- the ordered readiness pipeline: REGISTER → COLLECT → INGEST → CONVERT → INDEX → QUALITY → RELEVANCE → HEALTH → READY;
- target-level supply health, structural retrieval quality, and deterministic relevance smoke state;
- M20 remediation queue actions with operator instructions and execution paths;
- read-only links to existing audit / planner endpoints when an action exposes an endpoint;
- explicit `automaticExecution: false`, collection-approval, and no-mutation indicators.

## Shared snapshot contract

M21 originally defined the top-level remediation snapshot shape inside the Admin server service. M22 moves that transport contract into `@markorbit/worker-runtime/foundational-remediation-snapshot` so the producer and UI consumer share one versioned type.

`assembleFoundationalRemediationQueueSnapshot` also enforces basic transport invariants:

- readiness and remediation jurisdictions must match;
- readiness and remediation target counts must match;
- workspace ID must be non-empty;
- optional top-K must be a positive integer;
- the resulting snapshot is always `READ_ONLY`, authorizes no collection, and reports `mutationPerformed: false`.

The existing M21 API remains protocol version `1.0`; this milestone does not change API semantics.

## Safety boundary

M22 does **not**:

- dispatch governed collection;
- register sources;
- retry conversion;
- ingest or synthesize evidence;
- rebuild retrieval indexes;
- execute M16/M17 remediation;
- edit relevance probes;
- tune BM25 or other ranking;
- broaden source scope;
- use LLM judgment to decide relevance or legal correctness;
- infer legal rules, deadlines, applicability, or recommendations.

The workbench is an observability and navigation surface only. Any future mutation control must retain the explicit approval and execution boundaries already defined by the underlying workflows.

## Validation

M22 adds worker-runtime contract tests and extends the UI Preview workflow to capture `/foundational`, ensuring the new page builds and renders with the existing Admin application.
