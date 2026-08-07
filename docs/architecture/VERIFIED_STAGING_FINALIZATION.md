# Verified Staging Finalization

## Scope

TASK-019 bridges persisted Staging verification evidence into the existing verifier-owned ConversionRun terminal transitions.

The finalizer accepts only Workspace, Staging document and idempotency identities. It does not accept a caller-supplied descriptor, verification outcome or failure decision.

## Authority chain

TASK-017 immutable Staging descriptor and CAS
-> TASK-018 append-only builtin-staging-verifier@1.0.0 evidence
-> TASK-019 control-plane finalizer
-> TASK-015 atomic verifier-owned ConversionRun transition

A Worker cannot invoke completion through Worker runtime reports. The finalizer does not use Worker credentials, lease tokens or Worker identity as verifier authority.

## Decisions

- READY with PASS or PASS_WITH_WARNINGS invokes the existing VERIFYING to COMPLETED transition and embeds the exact READY descriptor in the completed ConversionRun.
- BLOCKED with FAIL invokes the existing VERIFYING to FAILED transition using STAGING_VERIFICATION_FAILED.
- Any mismatched verifier, Workspace, document, Run, content hash, outcome or descriptor decision is rejected.
- A GENERATED or otherwise undecided descriptor cannot be finalized.

## Idempotency

The caller key is version-bound to the exact verifier and forwarded to the existing conversion_verifier_transitions ledger. Identical replay returns the original terminal transition; conflicting reuse is rejected by the existing transition repository.

## Persistence

TASK-019 adds no new migration. TASK-018 already persists append-only verification evidence, while TASK-015 already persists verifier transition idempotency, ordered ConversionExecutionEvents and terminal ConversionRun state atomically.

## Non-goals

No Converter execution, scheduler, automatic retry, Obsidian adapter, Ready Package, AI extraction, semantic analysis or MarkOrbit Core behavior is added.
