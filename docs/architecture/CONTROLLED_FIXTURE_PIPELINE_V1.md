# Controlled Fixture Pipeline v1

## Scope

TASK-020 composes the existing conversion boundaries into one explicitly invoked, single-item pipeline:

1. claim compatible Conversion work;
2. execute `builtin-text-markdown@1.0.0` through the authenticated Worker runtime boundary;
3. ingest the emitted Markdown into the immutable Staging CAS;
4. verify the generated Staging document with `builtin-staging-verifier@1.0.0`;
5. finalize the ConversionRun through the existing verifier-owned terminal transition.

The pipeline is an application-layer composition service. It does not replace or bypass the repositories that own each state transition.

## Authority boundaries

The Worker still owns only STARTED, progress, output-ready and structured worker failure reports. It cannot mark a Staging document READY/BLOCKED and cannot complete a ConversionRun.

The control plane still owns Staging ingest, verification and finalization. The pipeline accepts no caller-supplied verification outcome, READY descriptor or terminal decision.

## Outcomes

- no compatible claim: `NO_COMPATIBLE_WORK`;
- fixture execution failure: `WORKER_FAILED`, with no automatic retry;
- READY with PASS or PASS_WITH_WARNINGS: `COMPLETED`;
- BLOCKED with FAIL: `FAILED`.

Ingest, verification and finalization use deterministic phase keys derived from one bounded execution key.

## Operational failures

Failures after output-ready, such as CAS filesystem errors or database transaction failures, remain operational exceptions. They are not converted into a second Worker failure report because Worker execution has already ended and verifier ownership has begun.

## Deferred work

No scheduler, polling loop, automatic retry, production RawArtifact transport, production object storage, Obsidian adapter, Ready Package publishing, semantic analysis, AI extraction or MarkOrbit Core behavior is added.
