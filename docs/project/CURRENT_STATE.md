# MarkOrbit Knowledge — Current Engineering State

Checkpoint date: 2026-08-24

This file is the canonical engineering handoff entry point. It records a verified checkpoint, not a dynamically generated branch pointer. Before any protected or paid operation, verify the current GitHub `main` SHA and the relevant issue/PR state again.

## Verified baseline

- Repository: `yoomarks/markorbit-knowledge`
- Baseline `main` after ADK-07 safety stabilization: `6ecbea9171b916859121f25cb206cf61193cfaf3`
- Baseline merge: PR #427 — ADK-07 ambiguous-delivery quarantine and worker CAS race safety
- Open production acceptance gate: issue #405 — ADK-06 real 3×2 provider acceptance
- Core ReadyPackage V2 cross-repository completion: Core PR `yoomarks/markorbit#182` merged; the older Knowledge PR #407 is not the active acceptance path.

## ADK sequence

- **ADK-00 — Implemented.** Architecture and authority contract.
- **ADK-01 — Implemented.** Provider-neutral runtime and DeepSeek adapter.
- **ADK-02 — Implemented.** Durable KnowledgeAssignment and immutable InstructionSet revisions.
- **ADK-03 — Implemented.** Exact provider JSON plus Markdown RawArtifact lineage.
- **ADK-04 — Implemented.** Immutable versioned Assignment Graph.
- **ADK-05 — Implemented.** Evidence-backed Assignment Candidates.
- **ADK-06 — Implementation complete; live acceptance OPEN.** Issue #405 still requires a real DeepSeek + OpenAI 3×2 run and retained evidence.
- **ADK-07 — Implemented; safety hardened through #427.** Durable queue, explicit retries, ambiguous-delivery quarantine and CAS worker/recovery transitions.
- **ADK-08 — Implemented.** Initial US Trademark Assignment Library.
- **ADK-09 — Implemented.** Governed candidate promotion with immutable promotion receipt; no automatic approval/execution.
- **ADK-10 — Implemented.** Separate US/AU/CA trademark Assignment Libraries and catalog bootstrap.

## ADK-06 acceptance gate

Issue #405 must remain open until all of the following are proven by a real provider run:

- exactly the frozen assignments `kas_us_trademark_filing`, `kas_us_trademark_section_8`, `kas_us_trademark_ttab`;
- exactly providers `DEEPSEEK`, `OPENAI`;
- approval reference `github:yoomarks/markorbit-knowledge#405`;
- six of six provider cells `EXECUTED`;
- six acquisition/lineage records;
- twelve unique finalized RawArtifact receipts;
- no unresolved in-flight provider delivery;
- authenticated execution state completed;
- no provider ranking, legal-truth verification or candidate auto-activation;
- encrypted evidence retained in authorized non-public durable storage.

The owner-only dispatch command now freezes the exact current `main` commit before dispatch. The live workflow must reject the run when `GITHUB_SHA` differs from that authorized SHA. GitHub Actions encrypted evidence is an operational recovery copy, not the long-term archive.

## ADK-07 production-safety invariants

PR #427 closes two previously unsafe replay/concurrency paths:

1. provider timeout/network errors are delivery-uncertain and are quarantined in `BLOCKED_RECOVERY`; they are not automatically replayable paid work;
2. worker state transitions use compare-and-set semantics so stale workers cannot overwrite recovery/operator state.

A provider response explicitly classified as safely retryable by the governed adapter may still enter `RETRY_PENDING`. Unknown adapter exceptions fail closed into recovery quarantine rather than being guessed retryable.

## Repository governance status

The GitHub branch endpoint was verified during the 2026-08-24 takeover and reported `main` as not branch-protected. This repository is public while ADK live workflows depend on paid-provider secrets and an evidence passphrase.

The connected GitHub action surface available to this engineering session does not expose branch-protection/ruleset mutation, so this repository setting has **not** been changed by the takeover. Before routine live paid execution, repository administration should enforce an equivalent protected-main/ruleset policy and preferably gate live secrets through a protected environment.

The repository-governance acceptance work is tracked in issue #429.

## Current engineering order

1. Merge the exact-SHA ADK-06 authorization and canonical-state documentation hardening.
2. Re-verify `main`, issue #405, secrets availability and repository governance.
3. Execute #405 only during the enforced DeepSeek off-peak window; do not bypass the pricing guard.
4. Retain the successful encrypted evidence outside the temporary GitHub Actions retention window and close #405 only after evidence verification.
5. Then start the next knowledge-engineering phase: source-grounded assignments with explicit official-source packs and citation provenance.
6. After grounding exists, progressively decompose broad workflow assignments into smaller reusable propositions rather than adding providers for their own sake.

## Permanent authority boundary

`AI response != verified knowledge != legal truth != Brain conclusion`.

Knowledge records governed assignments, provider evidence, provenance, graphs, candidates, promotion receipts and libraries. It does not rank providers, certify legal truth, authorize client filings or silently grant execution authority from library membership.
