# KG-009 — Knowledge Relationship API

Date: 2026-08-27  
Status: implementation contract for issue #532

## Purpose

Expose the existing Content Relationship projection to trusted internal consumers such as MarkOrbit Brain without turning Knowledge into Brain.

The API is an objective content-neighborhood transport. It does not decide whether content is relevant to a customer, matter, trademark, company, person, or legal strategy.

## Endpoint

`POST /api/internal/knowledge/relationships`

The request uses `KnowledgeRelationshipQueryV1` and supplies a canonical `ContentObjectRefV1` plus optional `limit` and `offset`.

The response uses `KnowledgeRelationshipResultV1` and contains only:

- the requested canonical content reference;
- objective facets already present in the Knowledge relationship projection;
- one-hop incoming/outgoing relationship items;
- the original `ContentEdgeV1`, including relation origin, evidence reference, and machine algorithm identity/version when present;
- deterministic pagination metadata: `total`, effective `limit`, `offset`, and `hasMore`.

The relationship repository remains responsible for deterministic ordering and enforces its existing maximum page size of 200.

## Authentication and workspace isolation

The endpoint is internal-only. It reuses the governed MarkOrbit internal Workspace Principal gate:

- `MO_INTERNAL_SERVICE_SECRET` must be configured server-side;
- `x-markorbit-internal-authorization` must match that secret;
- `x-markorbit-principal` must contain a valid non-expired Workspace Principal envelope;
- the principal must include `matter:read`;
- the principal workspace must exactly match `query.content.workspaceId`.

Browser clients must never receive the internal service secret or forge these headers.

## Permanent semantic boundary

KG-009 must not add or infer:

- Reader/UI decoration such as `readerHref`, title, or `sourceName`;
- relevance, authority, trust, truth, business, customer, matter, or case scores;
- entity resolution or real-world identity joins;
- legal conclusions, strategy, or recommendations;
- vector retrieval/ranking. That composition belongs to KG-010 and Brain.

Brain may consume KG-009 objective neighborhoods/evidence and perform its own reasoning downstream.
