# TMclass HAR extraction

TMclass acquisition belongs to MarkOrbit Knowledge. The extractor reads previously captured HAR
files without making network requests, projects official Term and Concept detail pages into
`TmclassSourcePageV1`, and produces one reviewable JSON bundle.

```bash
pnpm --filter @markorbit/worker tmclass:extract-har -- \
  --input /evidence/euipo.europa.eu.har \
  --input /evidence/2euipo.europa.eu.har \
  --output /evidence/tmclass-pages.json \
  --browser-executable /path/to/chrome
```

`MARKORBIT_TMCLASS_BROWSER_EXECUTABLE_PATH` may replace `--browser-executable`. Browser networking
is disabled during extraction; the browser is used only as an HTML DOM parser.

To finalize captured pages as immutable Knowledge RawArtifacts and emit exact
`TMCLASS_SOURCE_EVIDENCE_V1` packages for Data Engine admission, run:

```powershell
pnpm --filter @markorbit/worker tmclass:import-har -- `
  --input C:\evidence\euipo.europa.eu.har `
  --database D:\yoomarks\markorbit-knowledge\.data\markorbit-knowledge.sqlite `
  --artifact-root D:\yoomarks\markorbit-knowledge\.data\artifacts `
  --workspace-id wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV `
  --output C:\evidence\tmclass-source-evidence-bundle.json `
  --browser-executable "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

The import creates or reuses the governed `tmclass-har@1.0.0` Connector, EUIPO TMclass Source,
and manual CollectionPlan. It completes a normal Worker execution and binds every evidence
package to the exact finalized HTML RawArtifact. It does not write Data Engine directly.

The bundle retains:

- Term identity, text, Nice class, language, accepting offices, taxonomy, translations and Sources;
- Concept status, class, Source, source date text, source-scoped Reference ID, scope and taxonomy;
- per-language Master Term, variant count and total count;
- independent Term identities with `MASTER` or `VARIANT` roles inside a Concept.

Only exact `https://euipo.europa.eu/ec2/term/{id}`,
`https://euipo.europa.eu/ec2/concept/{id}` and
`https://euipo.europa.eu/ec2/concept/{id}/{language}` responses are accepted. Query strings,
fragments, other origins, non-HTML responses and oversized pages are rejected or excluded.

The extraction bundle is source evidence, not capability truth. It must be admitted through the
governed durable-artifact and Data Engine fact-admission path before downstream use.

## Resumable public corpus capture

The live corpus operator captures the public TMclass search surface for all 41 data languages,
all 45 Nice classes, HDB, and every office database exposed for each language at capture time. It
checks `robots.txt`, retains exact search/configuration responses, fails closed on search-result
caps or pagination drift, and then follows Term, Concept, translation and Concept-language links
until the detail graph reaches closure.

```powershell
pnpm --filter @markorbit/worker tmclass:capture-live-corpus -- `
  --output-root D:\evidence\tmclass-live `
  --languages all `
  --nice-classes all `
  --capture all `
  --concurrency 4 `
  --detail-batch-size 250 `
  --search-batch-size 20 `
  --search-page-size 1000 `
  --min-start-interval-ms 500 `
  --timeout-ms 120000 `
  --max-attempts 0
```

Every search or detail batch is atomically written as HAR with a hash-bound summary. Re-running
the same command skips completed batches. `STATUS.json` records the active phase and
`COMPLETE.json` is written only after no undiscovered Term, Concept or Concept-language route
remains. `--max-attempts 0` keeps retrying transient timeouts, empty successful responses, HTTP
429 responses and server errors with a capped backoff; other HTTP failures still stop immediately.
The verified public search surface accepts up to 1,000 results per page; the page size is recorded
in every index manifest and completion marker so a resumed root cannot mix incompatible pagination.

The continuous Knowledge admission operator watches completed detail HAR batches, imports them as
immutable RawArtifacts, and emits one evidence bundle per batch:

```powershell
pnpm --filter @markorbit/worker tmclass:import-live-corpus -- `
  --capture-root D:\evidence\tmclass-live `
  --output-root D:\evidence\tmclass-bundles `
  --database D:\knowledge\.data\markorbit-knowledge.sqlite `
  --artifact-root D:\knowledge\.data\artifacts `
  --workspace-id wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV `
  --browser-executable "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --continuous
```
