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
