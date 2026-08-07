# KNOWLEDGE-TASK-019 — Verified Staging Completion & ConversionRun Finalization

Bridge persisted TASK-018 verification evidence into the existing verifier-owned TASK-015 ConversionRun terminal transitions.

## Scope

- Load the persisted Staging descriptor and append-only verification evidence.
- Require exact built-in verifier identity and immutable content/evidence binding.
- READY with PASS/PASS_WITH_WARNINGS completes the VERIFYING ConversionRun.
- BLOCKED with FAIL fails the VERIFYING ConversionRun with structured verification evidence.
- Preserve replay/conflict semantics through the existing verifier transition ledger.
- Keep callers from injecting an arbitrary descriptor, outcome, verifier identity, or failure decision.
- Reuse existing atomic terminal-transition persistence instead of introducing a duplicate finalization ledger.

## Non-goals

No Worker completion authority, Converter execution, scheduling, retry, Obsidian, Ready Package, semantic analysis, AI extraction, or MarkOrbit Core behavior.
