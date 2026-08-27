# MarkOrbit Knowledge — Cognitive Platform Alignment

Status: Proposed alignment baseline

This document aligns MarkOrbit Knowledge with the MarkOrbit cognitive-platform architecture used by Core/Brain/Capability and Data Engine.

## 1. Knowledge responsibility

Knowledge owns documents, evidence, acquisition provenance, conversion, reviewed Markdown, and durable staging/delivery.

Knowledge does not own business intelligence conclusions or Brain methods.

The governing boundary is:

> Knowledge owns documents. Data Engine owns facts. Brain owns methods. Capability owns execution. Products own business state.

## 2. What Knowledge must provide downstream

Knowledge should make canonical Markdown easy to retrieve, navigate, and verify without becoming an intelligence engine.

Required downstream signals should include, where available and governed:

- canonical document identity;
- source identity and authority metadata;
- content version/hash;
- publication/effective/supersession dates when known;
- jurisdiction and document type metadata;
- Markdown heading/section structure;
- tags and topic metadata;
- explicit links and backlinks;
- related-document relationships;
- supersedes/superseded-by relationships;
- source-family/authority relationships;
- Vault/Obsidian relationships that are explicitly represented and indexable.

## 3. Obsidian/Vault rule

Obsidian/Vault is valuable only when it improves one or more of:

1. governed human review;
2. document navigation;
3. retrieval precision/recall;
4. relationship expansion;
5. version/supersession understanding.

Vault storage alone must not be treated as a semantic knowledge graph.

Before adding new Obsidian-style graph functionality, measure whether existing Vault structure already provides useful links/tags/relationships for Brain retrieval. Add only the smallest relationship index that produces measurable retrieval value.

## 4. What Knowledge must not do

Knowledge must not become responsible for:

- fee or deadline resolution as current business values;
- trademark/entity classification conclusions;
- risk scores;
- opportunity detection;
- entity-group inference;
- scoring/ranking algorithms;
- product recommendations;
- customer/business lifecycle state.

Those belong to Brain methods, Capability execution, or product state depending on the artifact.

## 5. Brain interaction model

Brain research may consume Knowledge in two modes:

### Research mode

Brain retrieves and reads Markdown to form or improve reusable methods.

Examples:

- Official Fee Resolution Method;
- Deadline Resolution Method;
- Filing-Basis Interpretation Method;
- Source Resolution Method;
- Temporal Resolution Method.

### Capability execution mode

A Capability may execute an ACTIVE Brain retrieval/resolution method against Knowledge to resolve a current value or rule.

Knowledge remains the source-document truth. Resolved values are not written back as Knowledge truth merely because a Brain/Capability method produced them.

## 6. Long-term development obligations

### K-CG-A — relationship inventory

Audit current Vault/Obsidian implementation and document which of the following are truly available today:

- tags;
- wikilinks;
- backlinks;
- headings;
- related-document references;
- supersession links;
- explicit concept relationships.

Do not infer capabilities from the word “Obsidian”.

### K-CG-B — retrieval contract

Define a read-only downstream retrieval/navigation contract for canonical Markdown and relationship signals. It must preserve provenance and version identity.

### K-CG-C — retrieval-value evaluation

Using real Brain research tasks, compare:

- metadata + lexical retrieval;
- semantic retrieval;
- metadata + lexical + semantic;
- the same retrieval plus Obsidian/Vault relationship expansion where available.

Only expand graph/index functionality if it materially improves quality or reduces cost/latency.

### K-CG-D — no semantic-boundary drift

Add architecture tests/documentation gates so Knowledge does not absorb Brain method logic, Capability result caches, or product state.

## 7. Exit criteria for Knowledge cognitive readiness

Knowledge is cognitive-platform-ready when:

- canonical Markdown can be retrieved with provenance and version identity;
- relevant structural/navigation relationships can be queried when present;
- Brain can reproducibly locate source sections used in a method or resolved reference;
- the value of Obsidian relationship enhancement has been measured rather than assumed;
- no Brain/business conclusion is required to be persisted in Knowledge.
