# Document Extraction Production Hardening V1

## Purpose

K-EXT-C closes the production-safety and provider-breadth gap around attachment conversion without creating a second conversion architecture. All document providers remain behind the existing immutable `ConverterManifest → ConversionProfile → ConversionRun → ConversionLease → RawArtifactReadGrant → StagingOutputUploadGrant → verified Staging` chain.

## Production providers

The supported production conversion identities are additive and exact-version bound:

- `local-rich-document-markdown@1.0.0` — DOCX, XLSX, CSV, JSON, XML, EMAIL and TEXT;
- `local-pdf-text-markdown@1.0.0` — PDF text-layer extraction through Poppler `pdfinfo` + `pdftotext`;
- `local-ocr-markdown@1.0.0` — explicit OCR for PDF/IMAGE through `pdftoppm` + Tesseract;
- existing built-in Markdown/HTML/PDF converters remain compatible and are not removed.

`local-pdf-text-markdown` is provisioned as an **opt-in** converter. Existing automatic foundational PDF profiles are deliberately not rewritten or duplicated. Operators may migrate a source/profile explicitly after validating the Poppler deployment. Scanned/image-only PDFs continue to require explicit OCR; text extraction never silently falls back to OCR.

## Subprocess boundary

The Node runtime owns claims, leases, grants, lifecycle transitions, canonical provenance and Staging commit. The Python process is a byte-to-Markdown body provider only.

The provider:

- receives one bounded protocol request over stdin;
- reads only the Worker-created immutable temporary input;
- writes only the designated sibling Markdown output;
- runs fixed argv commands with `shell=False`;
- returns bounded structured result evidence;
- cannot create or finalize ConversionRuns;
- cannot generate canonical `markorbit.*` frontmatter.

For PDF text-layer extraction the Worker requires Poppler commands available as `pdfinfo` and `pdftotext`, optionally overridden with `MARKORBIT_PDFINFO_EXECUTABLE` and `MARKORBIT_PDFTOTEXT_EXECUTABLE`. OCR continues to use `MARKORBIT_PDFTOPPM_EXECUTABLE` and `MARKORBIT_TESSERACT_EXECUTABLE` when overrides are needed.

## OOXML archive policy

DOCX/XLSX inputs are ZIP packages and are treated as hostile compressed containers. Before any member is read the extractor verifies:

- at most 4096 archive members;
- no absolute, drive-prefixed, dot/parent, backslash or NUL member path;
- no ZIP symlink entry;
- no encrypted entry;
- at most 16 MB uncompressed per member;
- at most 80 MB aggregate uncompressed size;
- compression ratio at most 200:1 for every non-empty member.

Member size evidence is rechecked after decompression. OOXML XML is subject to the same bounded XML parser policy as standalone XML.

## Structured input limits

The 25 MB RawArtifact input boundary remains unchanged. Additional structural limits prevent small compressed/structured files from causing unbounded work:

- CSV: 5000 rows, 256 columns, 500,000 cells, 100,000 characters per cell;
- JSON: 100,000 nodes and depth 64;
- XML/OOXML XML: 100,000 nodes, depth 64; standalone XML extraction emits at most 10,000 text/attribute values;
- XML DTD/entity declarations are rejected before parsing;
- PDF text layer: at most the existing configured 80-page maximum, with page count obtained from `pdfinfo` before text extraction.

## PDF semantics

`local-pdf-text-markdown` first verifies the PDF header, asks `pdfinfo` for page/encryption evidence, rejects encrypted/password-protected files, enforces the page limit, and then invokes `pdftotext` for UTF-8 layout-preserving text.

An empty text layer returns `PDF_TEXT_NO_EXTRACTABLE_TEXT`. It does not trigger OCR automatically. This preserves operator intent, resource accounting and provenance: OCR remains a separate exact converter identity.

## Non-goals

This work does not introduce automatic retries, archive extraction as acquisition, macros, embedded-object execution, two-way filesystem synchronization, converter auto-migration, or changes to ReadyPackage delivery semantics.
