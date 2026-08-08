# USPTO Golden Source — Staging / ReadyPackage Runbook

This runbook is the deployment gate for the first production post-acquisition loop. It is intentionally separate from deterministic PR CI.

Target evidence chain:

`USPTO /trademarks → controlled Crawl4AI → MARKDOWN RawArtifact → governed ConversionRun → builtin-markdown-staging@1.0.0 → Verified Staging → ReadyPackage → Core Intake receipt`

Regular pull-request CI must not perform a live public crawl. A deployment/manual smoke may do so only with the configured control plane, Worker credential and network egress policy.

The final smoke must record the RawArtifact ID/SHA-256, ConversionRun ID, Staging document ID/SHA-256, ReadyPackage ID and Core Intake receipt ID. These identifiers demonstrate provenance continuity; they are not a professional or legal approval of the captured USPTO content.
