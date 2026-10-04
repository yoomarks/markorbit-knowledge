# UKIPO offline journal XHTML and original-logo pilot (#910)

This is a **local source-evidence staging tool**, not the canonical Knowledge
RawArtifact publisher and not a Data Engine importer. It never changes F: ZIPs
or existing API/ClickHouse/PostgreSQL serving state.

## Source identity and scope

The input is a locally approved YYYY-NNN.zip from
F:\MarkOrbitData\raw\incoming\uk. The tool computes the whole ZIP SHA-256,
requires its YYYY-NNN/ folder and the word.html internal journal title to
match the filename, and rejects untrusted archive paths and missing originals.
It parses the five index views (word, image, class, owner, agent) as
**five views of the same issue**, never five independent mark streams. Class
and owner indexes must cover every actual detail page. Indexes may contain
multiple links to a single mark, and word/image/agent indexes may legitimately
be partial. Detail-page UK and WO identities stay distinct.

For each detail, preserve the raw ZIP hash, exact member path and HTML hash,
original marktext, applicant/representative strings, Class -> original
goods/services descriptions and each mark-image source member in series
display order. The HTML id regdate is retained as a raw label without
assigning an unsupported current legal status. Image references must identify
an actual ZIP member under issue/images/; thumbnails (tn-) and UI assets
are never copied as original mark images.

Source XHTML sometimes contains malformed less-than in mark-image alt text
or numeric references encoding a UTF-16 surrogate pair. The parser repairs
only those known markup encodings in its in-memory XML representation,
preserves the raw HTML SHA and records per-detail source_markup_repairs.
Unpaired invalid surrogate references still fail closed. Original archive
bytes never change. No legal or semantic interpretation occurs in Knowledge.

## Staging storage

Read-only --preflight-only validates the entire named issue and emits a
size/identity/coverage manifest without writing any asset or handoff record.

Separately admitted --stage --expected-sha SHA256 writes original image bytes
in an F:-only, SHA-256 content-addressed CAS rooted at
F:\MarkOrbitData\visual-raw\assets\raw\gb\mark-images.
An original file uses sha256/aa/bb/hash plus an image suffix derived from
actual file magic. Shared images are stored once. Immutable source-grounded
detail JSONL and a content-hashed manifest are written directly under
E:\MarkOrbitData\structured-stage\gb\ukipo\journal-v1. This is the accepted
`hot_global` structured-stage placement; D remains `hot_cn` only.

New issues must be staged from F:\MarkOrbitData\raw\incoming\uk. After a
separately governed Data Engine admission commits and verifies the issue, its
exact raw ZIP may move to F:\MarkOrbitData\raw\archive\uk. Read-only replay
and audit resolve an issue from exactly one of incoming or archive and fail
closed if the same issue exists in both locations. Staging never mutates or
restages an archived source.

The F: writer refuses symlink/junction traversal, verifies any existing CAS
object, writes new objects through same-directory temporary files and refuses
to overwrite existing immutable handoffs. Before writing, F: must have enough
free space to retain **30% of its physical size plus an additional 64 GiB
buffer** after the proposed image bytes. This tool never writes the existing
Docker/ClickHouse VHDX directories or changes image roots for other countries.

## Accepted first pilot

Local issue 2026-033.zip, ZIP SHA
63690a48858778b01e2eb06edc31a5b8bb72dd89c02b30133234014004741814,
was independently parsed and staged: 3,351 details (2,868 UK / 483 WO),
1,462 mark-image associations, 1,460 unique originals, 9,010,718 original
bytes. The originally accepted E: CAS bytes and every detail/image link were
independently verified; the accepted receipt remains immutable. The physical
original-visual authority is now F:, and E: is only a temporary pre-correction
copy until a separately verified relocation is completed. Immutable first-pilot manifest SHA:
ea413c3caefec4e6ded77cceb5776c5afcee53c20dbe988e9e29bbeee59724b0.
This older first-pilot receipt predates optional source_markup_repairs per
detail; keep it immutable rather than rewriting accepted evidence.

The corrected 2026-018.zip SHA is
7ba01d4e49184b5f5b308f69998ba4f22c0ef49e63919bd34910d4ba18f9338f;
the corrected 2026-035.zip SHA is
48c1e35bf12b997f35f59ceaf2b8b042fa592d3f3033b8ed7e2e51b4492a0ec8.
These are distinct real issues, not duplicates of 2026-022 or 2026-039.

## Production boundary

Staged JSONL and CAS evidence are **not** published RawArtifact V1 records,
not a current British trademark register, and not Data Engine GB tables.
Data Engine issue yoomarks/markorbit-data-engine#855 separately owns schema,
historical-stock co-owner correctness, GB journal history, F: original-image relations,
controlled ingestion, independent receipts and serving projections. Never
declare nationwide current coverage from the 2018 open-data snapshot plus a
partial later journal window.

## Independently verified 78-issue source staging

All 78 local journals (2025/014–052 and 2026/001–039) have immutable
stage manifests and original-mark-image CAS evidence. The corrected
2026/018 and 2026/035 files have independently verified distinct source
hashes and matching internal titles/folders.

An independent full staged-JSONL and raw-ZIP replay audit verified
295,930 unique issue/detail identities, 132,482 original image associations
and the actual SHA-256 bytes of 131,210 unique originals currently staged on E:
(836,495,412 bytes). Immutable evidence:

- D:\yoomarks\governed-plans\910\ukipo-78-stage-independent-audit-r1.json
- SHA-256 c112d15007b7afe9d0c8f5a12ceb7726d088538fb5ac089cb37c935ab4079e00

Six issues have explicit **partial original-image evidence**: 2026/012,
017, 023, 027, 029 and 031. A source-bound, read-only audit established
seven references to original JPGs absent from their respective official
ZIPs. The exact exception audit SHA is
06e667cb72b6466dff8f4c7db8cffbbba35458f223f949e285966e3c5ca6e1e5.
Those six issues were staged only after checking the exact ZIP SHA and
every approved (mark, missing source member) pair.

Affected detail records keep their original wording and provenance;
missing originals have null CAS paths and hashes, never substituted
thumbnails, blank files or another mark's artwork. Their manifests carry
image_evidence_complete=false, the precise missing list and audit SHA.
The other 72 manifests were not overwritten. Full image-evidence
acceptance remains blocked for the seven missing source originals pending
separately sourced, verifiable official bytes.

This stage does not establish canonical Knowledge RawArtifact publication,
GB Country Store insertion, current UK register coverage or API serving
readiness. Future UKIPO original-logo writes target F: only. Existing E: CAS
objects are retained until an independently verified F: relocation receipt is
accepted; deletion of the E: copy requires separate authority.

## Governed E: to F: original-visual relocation

The pre-correction E: CAS is migrated only by the reviewed
`workers/local_folder/ukipo_visual_relocate.py` operator. Plan freeze verifies
all 131,210 E: CAS objects against the SHA-256 encoded in each filename and
pins the accepted 78-issue audit plus a path/size inventory hash. The target
must be absent when the plan is frozen.

Apply is additive and resumable. Existing target objects are reused only when
their size and SHA-256 exactly match the frozen source; a mismatching object is
never overwritten. New objects are written through a verified same-directory
temporary file and then linked into the immutable CAS namespace. After copy,
the complete F: CAS and the retained E: source are both reverified.

The capacity authority freezes the physical F: volume size and its
30%-plus-64-GiB reserve floor, but not the observed free-byte snapshot. Apply
checks live free space against the frozen floor after accounting for all
remaining missing bytes.

Apply requires the exact frozen plan SHA and token:

`GO #910 UKIPO-GB-VISUAL-F-RELOCATE <plan-sha> ADDITIVE-COPY-VERIFY-NO-DELETE`

A successful relocation receipt explicitly keeps `source_deleted=false` and
does not authorize Data Engine ingestion, API serving, or deletion of the E:
copy. Any later E: cleanup requires its own reviewed authority and an
independent F: residency audit.
