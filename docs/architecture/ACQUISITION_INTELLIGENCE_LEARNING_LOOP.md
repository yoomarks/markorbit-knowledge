# Acquisition Intelligence Learning Loop

MarkOrbit Knowledge treats every governed acquisition run as both a collection event and a reusable learning episode.

## Loop

`Observe → Diagnose → Extract Pattern → Promote to Playbook → Auto-select → Re-validate`

The learning loop changes acquisition strategy evidence and ranking. It does not change source content, fabricate legal truth, grant collection authority, or silently activate new production behavior.

## Durable learning objects

- `SourceFingerprint` records observable source structure.
- `AcquisitionPlaybook` composes reusable acquisition primitives.
- `AcquisitionRunEvidence` records what actually happened in a run.
- `RunLesson` extracts deterministic, evidence-linked experience.
- `StrategyCandidate` carries proposed reusable behavior through an explicit promotion lifecycle.
- `AcquisitionStrategySelection` records why a playbook was selected and the fallback order.

## Promotion lifecycle

`OBSERVED → CANDIDATE → VALIDATED → PROMOTED → ACTIVE → DEPRECATED`

A successful run can improve historical evidence and ranking confidence, but it cannot skip promotion stages.

## Experience compounding

The persistence layer keeps exact run evidence, extracted lessons, source fingerprints, strategy selections and playbook outcome statistics. Subsequent selection can therefore prefer strategies that repeatedly achieve better coverage and reliability for structurally compatible sources.

The intended system-level effect is that onboarding time and source-specific code for new authoritative IP sources decrease as the corpus of verified acquisition experience grows.
