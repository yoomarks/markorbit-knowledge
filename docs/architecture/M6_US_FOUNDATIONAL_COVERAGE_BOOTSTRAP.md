# M6 — US Foundational Source Bootstrap

## Purpose

M5 defined the US Source Coverage Map. M6 turns the active `FOUNDATIONAL` portion of that map into an explicit, operator-controlled Source Registry bootstrap and proves that representative registered sources can produce governed RawArtifact evidence.

This phase is about source-data supply readiness. It does not move MarkOrbit Knowledge into legal interpretation or final knowledge construction.

## Operator flow

The worker package exposes:

```bash
pnpm --filter @markorbit/worker bootstrap:coverage
```

Default behavior:

1. read the active US `FOUNDATIONAL` targets from `/api/source-coverage`;
2. ensure the production Crawl4AI connector manifest exists;
3. reuse targets already represented by Source Registry canonical/entrypoint matching;
4. create only missing SourceDefinition records;
5. re-read the coverage evaluation and fail if any target remains unregistered;
6. perform no collection dispatch.

The default command is therefore a registry bootstrap only. It does not create collection authorization.

## Explicit representative acquisition

For an operator or isolated live smoke that intentionally wants acquisition evidence:

```bash
pnpm --filter @markorbit/worker bootstrap:coverage -- --dispatch-representative
```

This additionally creates bounded `MANUAL` Collection Plans and explicitly dispatches four representative targets:

- USPTO Trademarks root;
- current TMEP;
- trademark fee information;
- registration maintenance guidance.

Each smoke plan is deliberately bounded to:

- `MANUAL` schedule;
- one canonical entrypoint;
- depth `0`;
- at most one item;
- no attachment fetch;
- robots respected;
- low rate limit;
- one attempt.

The catalog itself remains non-authorizing. The explicit CLI flag is the operator action that creates the representative runs.

## SourceDefinition projection

A coverage target is projected into Source Registry using its catalog-owned facts:

- source type;
- category;
- authority level;
- jurisdiction;
- languages;
- canonical URI;
- entrypoints;
- JavaScript acquisition hint.

The created SourceDefinition includes traceability extensions:

```text
x-markorbit-source-coverage-target-id
x-markorbit-source-coverage-protocol
x-markorbit-authority-basis
x-markorbit-acquisition-mode
x-markorbit-collection-authorization = false
```

`authorityBasis` remains the explicitly curated value from the coverage catalog. No hostname, `.gov`, organization name or page content is used to infer authority.

## Idempotence

Registration state is evaluated through the M5 coverage evaluator before mutation. Existing Sources are reused. After mutation the evaluator is run again and the bootstrap fails unless every requested foundational target is `REGISTERED`.

This means an existing golden-source SourceDefinition for `https://www.uspto.gov/trademarks` satisfies the matching coverage target and is not duplicated.

## Live regression workflow

`.github/workflows/uspto-foundational-coverage-live-smoke.yml` creates isolated temporary registry/artifact state, then:

1. starts the control plane;
2. registers all active US foundational source targets;
3. explicitly dispatches the four representative manual runs;
4. starts the production Worker protocol with the existing CI direct-egress exception;
5. waits for each run to complete;
6. verifies governed RawArtifact evidence, SHA-256 metadata, USPTO HTTPS provenance and `crawl4ai-web@1.2.0` collector provenance.

The isolated workflow does not mutate any deployed registry.

## Hard boundaries

M6 still does **not**:

- automatically authorize collection from the Source Coverage Map;
- create recurring schedules;
- enable scheduler authority;
- auto-dispatch all registered foundational sources;
- infer authority from URLs;
- interpret trademark law;
- calculate deadlines;
- create Rule / Requirement / Procedure / Exception objects;
- produce final legal answers.

The Source Registry represents what foundational sources exist. Collection remains a separate, explicit operational decision.

## Next major workstream

After the foundational registration/bootstrap path is proven, the next material gap is coverage operations: measure which registered targets have successful acquisition evidence, normalization, searchable documents and fresh versions, then expose those supply-health gaps without collapsing them into legal truth or Source Intelligence policy scoring.
