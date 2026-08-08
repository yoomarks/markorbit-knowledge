# USPTO Golden Source — Staging / ReadyPackage Runbook

This runbook is the deployment gate for the first production post-acquisition loop. It is intentionally separate from deterministic PR CI.

Target evidence chain:

`USPTO /trademarks → controlled Crawl4AI → MARKDOWN RawArtifact → explicit conversion authorization → governed ConversionRun → builtin-markdown-staging@1.0.0 → Verified Staging → ReadyPackage → Core Intake envelope`

Regular pull-request CI must not perform a live public crawl. A deployment/manual smoke may do so only with the configured control plane, Worker credential and network egress policy.

## Provision the production conversion path

After the USPTO Golden Source and production Worker already exist:

```bash
pnpm --filter @markorbit/worker bootstrap:uspto-conversion
```

The command idempotently ensures the exact production Converter, USPTO-specific Conversion Profile and Worker conversion capability. It prints the Workspace ID and conversion environment values required by the Worker.

To authorize the latest captured USPTO Markdown RawArtifact and dispatch one manual ConversionRun:

```bash
pnpm --filter @markorbit/worker bootstrap:uspto-conversion -- --dispatch-latest
```

The authorization step rereads the immutable RawArtifact bytes, verifies size/SHA-256 and requires an ACTIVE compatible Conversion Profile before changing the processing state to `READY_FOR_CONVERSION`. This is processing readiness only; it is not content or legal verification.

Enable conversion polling for the existing Worker with the values printed by the bootstrap command:

```text
MARKORBIT_CONVERSION_ENABLED=1
MARKORBIT_WORKSPACE_ID=<workspace id>
MARKORBIT_CONVERSION_CAPABILITY_REVISION=<revision>
MARKORBIT_CONVERSION_LEASE_DURATION_SECONDS=300
```

## Evidence required from the smoke

Record the following durable identifiers and digests:

- RawArtifact ID and SHA-256;
- ConversionRun ID and exact Converter version;
- Staging document ID and SHA-256;
- Staging verification ID and outcome;
- ReadyPackage ID and evidence digest;
- generated Core Intake request ID and package digest.

The Knowledge service may expose the side-effect-free Core Intake envelope through:

`GET /api/ready-packages/:id/core-intake?workspaceId=...`

The response must remain `transportStatus: NOT_SUBMITTED` until a real Core transport exists and produces its own acceptance result. Knowledge must not invent a Core receipt or mark the ReadyPackage `HANDED_OFF` merely because it created the request envelope.

These identifiers demonstrate acquisition/conversion/provenance continuity. They do not constitute professional approval or proof that the captured USPTO content is current legal truth.
