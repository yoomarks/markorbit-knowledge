# Production Markdown Staging + ReadyPackage v1

## Goal

Close the first production evidence path after web acquisition:

`Crawl4AI MARKDOWN RawArtifact → governed ConversionRun → production Markdown staging → Staging verification → completed ConversionRun → ReadyPackage → Core Intake`

This path is intentionally narrow. Crawl4AI already produced Markdown, so v1 does not fetch again and does not use an LLM to rewrite or interpret legal content.

## Authority boundary

A successful conversion proves only that:

- the immutable RawArtifact bytes matched their recorded size and SHA-256;
- the exact governed Converter processed the exact leased ConversionRun;
- output bytes matched the Staging upload evidence;
- the built-in Staging verifier accepted the required provenance bindings and Markdown structure;
- the resulting package has complete acquisition/conversion provenance.

It does **not** prove legal truth, current law, professional correctness, contact validity, source authority beyond recorded provenance, or suitability for a particular Matter.

## Frozen production Converter

`builtin-markdown-staging@1.0.0`

Input:

- Artifact kind: `MARKDOWN`
- MIME: `text/markdown`

Output:

- `text/markdown`
- deterministic UTF-8/newline normalization
- required `markorbit.*` provenance frontmatter
- original Markdown body preserved apart from BOM/newline normalization

The Converter does not execute JavaScript, call external services, infer claims, summarize, translate, classify legal meaning, or mutate protected Core state.

## Runtime rule

The production path must use Conversion Runtime v1 claims, exact Converter capability matching, lease/attempt binding, RawArtifact read grants, Staging upload grants, worker reports, Staging verification and verifier-owned completion. Production code must not skip directly from RawArtifact to a `READY` Staging descriptor.

## ReadyPackage rule

A ReadyPackage is a durable handoff envelope over immutable evidence references. `ready` means acquisition integrity, conversion integrity and provenance completeness are ready for downstream Core processing. It never means the legal content has been approved or professionally verified.
