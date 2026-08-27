# MarkOrbit Knowledge — Cognitive Platform Alignment

Status: Proposed alignment baseline

This document aligns MarkOrbit Knowledge with the shared cognitive-platform architecture used by Brain, Capability, Data Engine, and product runtimes.

## 1. Knowledge responsibility

Knowledge owns documents, evidence, acquisition provenance, conversion, reviewed canonical Markdown, and durable staging/delivery.

Knowledge does not own Brain methods, business intelligence conclusions, product caches, or customer/business state.

The governing model is:

> Knowledge owns documents. Data Engine owns facts. Brain Research consumes both. Brain publishes reusable methods. Capability executes ACTIVE methods. Products own business state.

## 2. Knowledge as Brain Research input

Knowledge is a first-class Brain Research source.

Brain Research may use Knowledge to study:

- official rules and procedures;
- filing-basis logic;
- fee/deadline structures;
- authority conflicts;
- effective-date and supersession rules;
- case reasoning;
- domain terminology and concept relationships;
- reusable retrieval/source/temporal-resolution methods.

Knowledge should make canonical Markdown easy to retrieve, navigate, and verify without becoming an intelligence engine.

## 3. Downstream signals

Required downstream signals should include, where actually available and governed:

- canonical document identity;
- exact content version/hash;
- source identity and authority metadata;
- publication/effective/supersession dates when known;
- jurisdiction/document type;
- Markdown heading/section structure;
- tags/topic metadata;
- explicit links/backlinks;
- related-document relationships;
- supersedes/superseded-by relationships;
- source-family/authority relationships;
- explicitly represented Vault/Obsidian relationships;
- exact section/range identity sufficient for Brain research lineage.

## 4. Obsidian/Vault rule

Obsidian/Vault is valuable only when it measurably improves one or more of:

1. governed human review;
2. document navigation;
3. retrieval precision/recall;
4. relationship expansion;
5. version/supersession understanding;
6. Brain Research cost/latency.

Vault storage alone must not be treated as a semantic graph.

Before adding graph functionality, audit what tags, links, backlinks, headings, and relationships actually exist. Add only the smallest relationship index justified by measured research value.

## 5. Research path versus production path

Knowledge belongs primarily to the slow Brain Research/recompile path.

```text
Knowledge Markdown -> Brain Research -> candidate method -> evaluation -> executable method package
```

Ordinary Capability requests should normally not retrieve and re-read Knowledge from scratch.

For stable constants such as fees, deadlines, grace periods, or operation windows, use controlled refresh/materialization:

```text
Knowledge -> Brain Resolution Method -> Reference Materializer -> Capability Reference Store -> high-frequency reads
```

Live request-time Knowledge retrieval is allowed only for capabilities that explicitly require it and whose latency/cost trade-off is accepted.

## 6. What Knowledge must not do

Knowledge must not become responsible for:

- current resolved fee/deadline values as business truth;
- trademark/entity classification conclusions;
- risk scores;
- opportunity detection;
- entity-group inference;
- scoring/ranking algorithms;
- product recommendations;
- Capability caches/materialized result ownership;
- customer/business lifecycle state.

## 7. Long-term development obligations

### K-CG-A — relationship and retrieval inventory

Audit current Vault/Obsidian and Markdown implementation and document which signals are truly available today.

### K-CG-B — Brain Research retrieval contract

Define a read-only contract supporting canonical Markdown discovery, section retrieval, relationship expansion, provenance, and exact version identity.

It should support Brain Research missions without requiring Knowledge to interpret the documents for Brain.

### K-CG-C — retrieval-value evaluation

Using real Brain Research tasks, compare:

- metadata + lexical retrieval;
- semantic retrieval;
- hybrid metadata/lexical/semantic retrieval;
- hybrid retrieval plus Obsidian/Vault relationship expansion where available.

Measure quality, cost, and latency.

### K-CG-D — controlled reference refresh

Define the smallest contract needed for Brain/Capability to refresh stable resolved references when Knowledge sources change, without placing Knowledge on every request hot path.

### K-CG-E — change signal for method/references

Where feasible, expose source/document version changes so downstream systems can determine whether a method or materialized reference may require revalidation/re-resolution.

### K-CG-F — no semantic-boundary drift

Add architecture documentation/tests ensuring Knowledge does not absorb Brain method logic, product intelligence, or business state.

## 8. Exit criteria for Knowledge cognitive readiness

Knowledge is ready when:

- Brain Research can reproducibly locate and read canonical Markdown with exact provenance/version identity;
- structural/navigation relationships can be queried where they genuinely exist;
- source changes can drive controlled research/reference refresh decisions;
- Obsidian enhancement value has been measured rather than assumed;
- high-frequency Capability reads do not require repeated full-document research;
- no Brain/business conclusion must be persisted in Knowledge.
