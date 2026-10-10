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
