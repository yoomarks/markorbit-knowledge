# Acquisition Intelligence Learning Loop

Status: **Phase 1 implemented and live-gate verified on 2026-08-22**.

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

## Phase 1 acceptance

| Acceptance condition                                                                  | Evidence in the current trunk                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Four reusable source-family shapes without source-name branching in the selector core | Static index, TOC graph, jurisdiction index and API document catalog profiles                                     |
| Production runs persist strategy revision and run evidence                            | Authenticated Worker learning intake plus durable SourceFingerprint and AcquisitionRunEvidence                    |
| Repeated success improves history without bypassing promotion                         | Aggregate playbook history and sequential promotion lifecycle                                                     |
| Known failures produce structured lessons                                             | Failure signatures, incomplete enumeration, validator availability and coverage regression lessons                |
| A structurally similar source can reuse an existing playbook                          | History-backed structural selection regression coverage                                                           |
| Coverage regression requests re-evaluation                                            | Previous-run coverage feedback and governed fallback re-evaluation                                                |
| No implicit production authority                                                      | Selection, lessons and candidates cannot dispatch collection or grant authority; ACTIVE requires HUMAN transition |

The initial live evidence set covers USPTO, WIPO, IP Australia and Country Index. Phase 1 completion does not mean every connector is automatically profiled or every Wave 1 authority has completed production validation.

## Deferred work

- expand real official-source coverage through the governed Wave 1 process;
- separate observation cohorts from promotion/activation cohorts;
- preserve long-lived production scorecard snapshots in the supported persistence boundary;
- use real failures to justify additional structural profiles or thin adapters.

Statistical or opaque learned ranking is not a current priority. The deterministic selector is the supported production baseline until real evidence demonstrates a concrete limitation.
