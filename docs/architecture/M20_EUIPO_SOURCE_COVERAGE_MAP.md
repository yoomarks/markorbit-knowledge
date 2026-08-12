# M20 — EUIPO Source Coverage Map

## Purpose

M20 extends the existing Source Coverage V1 catalog from USPTO and WIPO to the European Union Intellectual Property Office (EUIPO). It uses the same version-controlled coverage object and the same registration-gap machinery; it does not create a parallel ingestion system.

## Curated public source baseline

The EUIPO catalog covers 11 official public trademark surfaces:

- trade marks portal;
- application guidance;
- eSearch Plus and IP search;
- Trade Mark Guidelines;
- TMclass / goods and services guidance;
- fees and payment guidance;
- opposition procedure;
- Boards of Appeal decisions and recent case law;
- EUIPO law and legal texts;
- post-filing management / renewal surface;
- official news and change signals.

Ten targets are `FOUNDATIONAL`; EUIPO news is a `CHANGE_SIGNAL` target.

## Global family vocabulary

The original Source Coverage V1 family vocabulary contains US-specific `TTAB_PROCEDURE` and `TTAB_PROCEEDINGS` values. M20 keeps those values unchanged for backward compatibility and additively introduces neutral families for global offices:

- `PROCEEDINGS`
- `APPEALS_AND_CASELAW`
- `LEGAL_TEXTS`

EUIPO opposition, Boards of Appeal/case-law, and legal-text targets use these neutral values. No existing US or WIPO target is renamed or reclassified.

## Governance boundary

A `SourceCoverageTarget` is coverage intent, not a `SourceDefinition`, `CollectionPlan`, schedule, or run authorization.

M20 does not:

- create or activate Sources;
- create or activate Collection Plans;
- authorize a collection run;
- grant scheduler authority;
- infer legal rules, deadlines, case outcomes, or source quality;
- move legal or semantic analysis into Knowledge.

The catalog only records explicitly curated public acquisition surfaces and acquisition hints. Any later registration, collection, conversion, retrieval, or delivery uses the existing governed Knowledge pipeline and its explicit operator boundaries.

## Compatibility

- Schema v1 / `SourceDefinition` is unchanged.
- Source Coverage protocol remains `1.0`.
- Existing USPTO and WIPO target ids and families are unchanged.
- Existing source-coverage APIs automatically expose EUIPO via the shared catalog.
- Registration-gap evaluation continues to use the shared canonical/entrypoint URI contract.
