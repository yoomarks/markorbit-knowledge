# Tavily Source Discovery Operations

Tavily is an optional **source-discovery** provider for MarkOrbit Knowledge. It is not a collection provider, legal-truth source, authority scorer, or replacement for Crawl4AI.

## Runtime contract

- Credential: runtime-only `TAVILY_API_KEY`.
- GitHub live environment: `TAVILY_API_KEY`.
- Worker command: `pnpm --filter @markorbit/worker discover:tavily`.
- One invocation accepts exactly one HTTP(S) seed URL and performs exactly one Tavily search request.
- Default candidate bound: 5. Hard maximum: 20.
- Results remain same-host unless the underlying governed batch explicitly changes that policy.
- Provider score/content/answer fields are not promoted into Knowledge candidates.
- Unknown delivery is non-replayable; the provider layer does not retry.

## Live smoke

`.github/workflows/tavily-source-discovery-live.yml` is manual-only. It must be dispatched from `main`, requires an exact authorized commit SHA, explicit live-call confirmation, and the `TAVILY_API_KEY` GitHub Environment. The workflow performs one bounded Tavily request.

Pull-request validation is separate and deterministic. It never exposes `TAVILY_API_KEY` and makes zero Tavily API calls.

## Operator budget

The current account allowance communicated by the operator is 1500 Tavily searches per month. Treat that as an operator budget, not a repository-enforced global counter. Tavily's provider-side quota remains authoritative. Keep routine CI provider-call-free and use live smoke only for deliberate acceptance or troubleshooting.
