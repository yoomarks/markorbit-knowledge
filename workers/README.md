# Workers

Worker runtimes execute declarative, capability-scoped acquisition or conversion tasks. Arbitrary remote code execution is forbidden.

## Crawl4AI

`workers/crawl4ai` is the first production web-acquisition sidecar. It is invoked by the Node `Crawl4AiSubprocessAcquirer` only after a governed CollectionRun/Job has been explicitly authorized and leased to a compatible Worker.

The Python sidecar can fetch and materialize bytes, but it cannot claim Jobs, mutate CollectionRun state, register RawArtifacts or bypass Worker lease authority. See `workers/crawl4ai/README.md` for setup and egress-security requirements.
