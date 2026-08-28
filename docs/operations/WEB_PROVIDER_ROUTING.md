# Web Provider Routing

## Purpose

MarkOrbit Knowledge keeps one acquisition authority and gives each external provider one bounded role:

- **Crawl4AI — PRIMARY CRAWLER.** Existing governed Web collection remains the default and continues to produce Knowledge RawArtifacts.
- **Tavily — SOURCE DISCOVERY.** Optional provider behind the existing `SourceDiscoveryProvider` contract. It only proposes structural `DISCOVERED` URLs for review.
- **Bright Data Web Unlocker — ANTI-BOT FALLBACK.** Optional direct-API fallback after an eligible Crawl4AI page-fetch failure. It is not a second crawler.

Firecrawl, Browserless, Apify, and Jina are intentionally outside this v1 routing decision.

## Cost and operations posture

The v1 posture is **free-tier-first and fail-closed**:

1. Crawl4AI remains usable without Tavily or Bright Data credentials.
2. Tavily and Bright Data credentials are runtime-only; deterministic CI must use fakes and must never call live vendor endpoints.
3. Configure no-spend / usage limits in each provider dashboard before enabling a live credential. Provider pricing and free allowances can change, so MarkOrbit does not encode a monetary allowance in code.
4. Bright Data also has a local per-run request ceiling. The default is 5 and the hard code ceiling is 50.
5. Quota/payment/rate-limit responses do not trigger provider-layer retry loops.
6. Once a provider request may have been delivered but its response is unknown, the provider layer reports a non-retryable error. This preserves the Knowledge rule that unknown paid-provider delivery must not auto-replay.

Live calls to paid providers are an explicit operational action, not a merge prerequisite; repository acceptance remains deterministic and credential-free.

## Tavily discovery

`TavilyWebsiteDiscoveryProvider` implements the existing `SourceDiscoveryProvider` interface.

It deliberately requests only search-result metadata:

- `search_depth=basic`
- `include_answer=false`
- `include_raw_content=false`
- `include_images=false`
- `auto_parameters=false`

Only URL and title are mapped to `SourceCandidate`. Tavily result scores, answer text, snippets, and raw content are not persisted as discovery authority or relevance evidence.

A seed may provide an operator-authored `metadata.discoveryQuery`. If absent, the provider derives a conservative site-scoped query from the seed URL. Existing `maxCandidates`, `maxFetches`, `sameHostOnly`, `allowedHosts`, and denied URL-pattern bounds continue to apply.

Example construction:

```ts
const provider = new TavilyWebsiteDiscoveryProvider({
  apiToken: process.env.TAVILY_API_KEY ?? "",
});
const runner = new SourceDiscoveryRunner(provider);
```

Do not create the provider when `TAVILY_API_KEY` is absent. Existing HTTP structural discovery remains available without Tavily.

## Bright Data Web Unlocker fallback

The Worker keeps `Crawl4AiSubprocessAcquirer` as primary. Bright Data is wrapped around it only when explicitly enabled.

Fallback is eligible only when all of the following are true:

- the primary error code is exactly `CRAWL4AI_FETCH_FAILED`;
- the immutable CollectionPlan requests only `HTML` and/or `MARKDOWN` page outputs;
- every governed start URL fits inside the configured local request cap.

It does **not** catch policy errors, cross-domain redirect blocks, proxy-policy failures, attachments, PDFs, office documents, or unsupported output kinds.

Bright Data is called through its recommended direct REST API (`https://api.brightdata.com/request`) using `format=raw`. MarkOrbit therefore does not need to deploy or operate an additional Bright Data proxy server for this fallback.

Unlocked HTML is then passed to `workers/crawl4ai/process_raw_html.py`, which uses Crawl4AI raw-HTML processing to emit the existing `HTML` / `MARKDOWN` artifact forms. Bright Data never manufactures Knowledge Markdown directly.

## Worker configuration

Bright Data is disabled by default.

```text
MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED=0
BRIGHTDATA_API_TOKEN=
BRIGHTDATA_WEB_UNLOCKER_ZONE=
MARKORBIT_BRIGHTDATA_MAX_REQUESTS_PER_RUN=5
```

To enable it:

```text
MARKORBIT_COLLECTION_PROVIDER=crawl4ai
MARKORBIT_BRIGHTDATA_FALLBACK_ENABLED=1
BRIGHTDATA_API_TOKEN=<runtime secret>
BRIGHTDATA_WEB_UNLOCKER_ZONE=<web unlocker zone>
```

Enabling fallback without both runtime credentials fails at Worker startup. Enabling it for a non-Crawl4AI collection provider is rejected.

## Existing Crawl4AI egress policy is unchanged

This routing work does not weaken `MARKORBIT_CRAWL4AI_REQUIRE_EGRESS_PROXY` or the existing production safety guard. Bright Data direct API is an anti-bot fallback, not a bypass around Crawl4AI's governed production egress boundary.

## Security and provenance

- Never write Tavily/Bright Data API keys to GitHub issues, PRs, logs, artifacts, or evidence records.
- The Crawl4AI raw-HTML subprocess receives a sanitized environment and does not receive provider credentials.
- Provider identity may appear as non-secret runtime/discovery metadata, but provider ranking must not be treated as source authority, legal truth, business relevance, or Brain interpretation.
- Existing Source, CollectionPlan, Run/Job, artifact-kind, byte-budget, and evidence/provenance boundaries remain authoritative.
