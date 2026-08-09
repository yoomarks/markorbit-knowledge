# M9 — Acquisition → Conversion → Retrieval Handoff

## Purpose

M9 closes the operational gap between an explicitly authorized collection run and the existing conversion / verification / retrieval pipeline.

Collection remains an operator decision. M9 only automates derived processing after an immutable RawArtifact has been successfully finalized.

```text
Explicit Collection Run
  ↓
RawArtifact finalize
  ↓
compatible ACTIVE autoConvert profile?
  ├─ no  → RawArtifact remains evidence only
  └─ yes → READY_FOR_CONVERSION
             ↓
           ConversionRun (AUTO_PROFILE)
             ↓
           Production Conversion Worker
             ↓
           Canonical Markdown
             ↓
           Staging Verification
             ↓
           Ready Package
             ↓
           Retrieval Index / Change Feed
```

## Durable handoff point

The handoff is executed by the control plane immediately after RawArtifact finalization. It is deliberately not implemented as an in-process callback from the collection Worker.

This keeps the immutable evidence boundary authoritative and makes acquisition independent from downstream conversion availability.

A profile, authorization, converter or queueing failure cannot roll back a successful RawArtifact upload. The finalize response reports the handoff as `DEFERRED/HANDOFF_FAILED`; operators can inspect and retry derived processing without reacquiring the source bytes.

## Automatic eligibility

Automatic conversion requires all of the following:

1. the RawArtifact belongs to the active Workspace;
2. an ACTIVE Conversion Profile is compatible with artifact kind and MIME type;
3. that profile explicitly sets `autoConvert: true`;
4. a matching ACTIVE ConverterManifest accepts the artifact;
5. immutable stored bytes still match the RawArtifact SHA-256 and byte count.

Source-scoped profiles outrank global profiles. Within the same scope, higher `precedence` wins, with stable profile ID ordering as the final tie-breaker.

The selected profile ID is passed explicitly into authorization so an older compatible profile cannot win accidentally.

## US FOUNDATIONAL representation policy

The M8 web collector emits paired HTML + Markdown page evidence. M9 intentionally auto-converts only the MARKDOWN member of that pair:

- `MARKDOWN` → `builtin-markdown-staging@1.0.0`;
- `HTML` remains immutable raw evidence and is not automatically duplicated into a second canonical document.

When a Source Coverage target explicitly authorizes attachments:

- `PDF` → `builtin-pdf-markdown@1.0.0`;
- `DOCX/XLSX/CSV/JSON/XML/EMAIL/TEXT` → `local-rich-document-markdown@1.0.0`;
- `IMAGE` → `local-ocr-markdown@1.0.0`.

PDF auto-conversion is text-layer extraction only. A scanned PDF does not silently fall through to OCR. OCR for a PDF remains an explicit profile/operation so extraction provenance is unambiguous.

## Idempotency

Automatic ConversionRun dispatch uses a deterministic key derived from the immutable artifact ID and selected Conversion Profile ID. Replaying artifact finalization therefore reuses the same conversion intent instead of creating duplicate canonical documents.

Artifacts already marked `CONVERTED`, `STAGED` or `ARCHIVED` are treated as already processed.

## Boundary

M9 does not:

- create recurring crawl schedules;
- decide when an authority should be recollected;
- infer legal authority or legal meaning;
- extract professional Rule / Requirement / Deadline / Procedure objects;
- calculate legal deadlines;
- create a legal knowledge graph;
- generate answers or recommendations.

It is a source-data pipeline orchestration feature only.
