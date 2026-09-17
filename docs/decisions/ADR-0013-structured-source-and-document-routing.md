# ADR-0013: Structured source and official document routing

- Status: Accepted
- Date: 2026-09-18
- Task: FOUNDATION-KNOWLEDGE-STRUCTURED-DOCUMENT-BOUNDARY-V1
- Issue: `yoomarks/markorbit-knowledge#787`
- Runtime mutation: None

## Context

One official system may expose both source-native structured data and official documents. For
example, USPTO TSDR exposes case/document metadata and document binaries, while CNIPA sources may
expose structured case fields alongside decisions or notices. Sending every provider response
through one document pipeline would blur the locked ownership boundary and could turn an already
structured official value into a second, less reliable fact extracted from Markdown.

The platform boundary remains:

- Knowledge owns what MarkOrbit has read: source registration, collections, immutable RawArtifact
  versions, canonical documents, provenance, staging and ReadyPackage delivery.
- Data Engine owns what happened: objective structured source facts, factual history and factual
  serving models.
- Brain/Method owns researched extraction and interpretation methods.
- Capability owns governed execution of ACTIVE methods.
- Products own business lifecycle state.

## Decision

Route each authoritative payload according to what the source directly supplies, not according to
which connector fetched it.

### Native structured fact route

An official XML, JSON, API response, bulk dataset or structured page field belongs on the Data
Engine ingestion route when the source explicitly represents an objective fact such as an
application/serial number, registration number, party, status, date, goods or services, filing
basis, proceeding identifier or event-history entry.

Data Engine preserves the source payload/provenance and maps the explicit field through a
versioned source-specific mapping. It must not ask Knowledge to convert that value to Markdown and
then re-extract it from natural language. A structured acquisition response may still be retained
as source evidence under Data Engine's own ingestion contract; that does not make it a Knowledge
canonical document.

### Official document route

An official office action, response, decision, ruling, certificate, petition document or other
documentary record belongs on the Knowledge route. Exact bytes enter the existing immutable
RawArtifact path. Conversion and canonical-document promotion retain the RawArtifact version,
hash, source URI and collection lineage.

Knowledge may preserve source-supplied document metadata and deterministic acquisition
classification. It does not decide legal effect, infer a citation relationship, or promote
document contents into Data Engine facts.

### Stable identity seam

A later document-derived fact candidate must reference the Knowledge-owned document evidence with
all of the following stable components:

- Knowledge document identity;
- immutable document/artifact version;
- exact evidence locator within that version;
- source authority;
- extraction method identity and version;
- reproducible evidence fingerprint.

The candidate is a proposal, not Data Engine truth. Governed validation and Data Engine admission
remain separate transitions. Data Engine stores the accepted fact and the immutable provenance
reference; it does not copy or own the document corpus.

Source-native case identity and Knowledge document identity may be linked by explicit official
identifiers such as jurisdiction plus serial/application number and source-supplied document ID.
Names, inferred dates, nearby ordering or text similarity are not sufficient identity joins.

## Mixed payload routing

When one provider response contains both structured fields and document content:

1. Preserve the exact response in the owner required by the admitted acquisition contract.
2. Route only explicitly structured factual fields to the Data Engine mapping path.
3. Route document bytes and document-version lineage to Knowledge.
4. Link the routes only with explicit source identity and immutable provenance.
5. If field meaning, document identity or owner is ambiguous, quarantine or leave the item
   unadmitted; do not create a best-effort fact.

This split does not require two network fetches. It requires two owner-correct admissions.

## Jurisdiction examples

### United States

- TSDR case fields and event-history entries that are explicitly structured are Data Engine fact
  inputs.
- The TSDR document index is immutable acquisition evidence used to select document binaries; it
  does not itself assert document contents or legal effect.
- An office-action PDF and its canonical version are Knowledge document truth.
- A cited-mark relationship may enter Data Engine only through a later governed Fact Candidate
  whose locator points to text in the official document. A generic refusal event is insufficient.

### China

- CNIPA structured application, registration, party, status, date and event fields are Data Engine
  fact inputs.
- A refusal, review, opposition, invalidation or non-use cancellation decision is Knowledge
  document truth.
- A cited-mark relationship requires an explicit citation in the official document plus the same
  governed candidate and validation path. The existence of a refusal or review event alone cannot
  create the edge.

## Fail-closed rules

- No official structured JSON/XML-to-Markdown-to-natural-language fact round trip.
- No arbitrary PDF reads or semantic extraction inside Data Engine.
- No legal interpretation or fact write in Knowledge.
- No Fact Candidate becomes accepted merely because a provider, model or extraction method
  returned it.
- No identity join from names, approximate text or ungoverned heuristics.
- No cross-service database or filesystem read; transfer uses a versioned contract or event.
- No Product state or protected external action follows automatically from a candidate or fact.

## Consequences

The platform keeps one canonical owner per truth class, preserves direct structured facts without
lossy detours, and retains a complete path from an admitted document-derived fact back to exact
evidence. The Evidence-to-Fact contract can now be designed without changing Knowledge Schema v1
or making either repository own the other's persistence.

This ADR adds no executor, source request, table, event, Fact Candidate wire contract, extraction
method or production mutation.
