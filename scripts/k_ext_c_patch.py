from __future__ import annotations

from pathlib import Path


def replace_block(text: str, start: str, end: str, replacement: str) -> str:
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    return text[:start_index] + replacement.rstrip() + "\n\n\n" + text[end_index:]


# ---------------------------------------------------------------------------
# Python document extraction hardening + real PDF text-layer provider
# ---------------------------------------------------------------------------
path = Path("workers/document_extraction/extract.py")
text = path.read_text()
text = text.replace(
    "DEFAULT_TIMEOUT_SECONDS = 180\n",
    """DEFAULT_TIMEOUT_SECONDS = 180
MAX_ARCHIVE_MEMBERS = 4096
MAX_ARCHIVE_MEMBER_BYTES = 16_000_000
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 80_000_000
MAX_ARCHIVE_COMPRESSION_RATIO = 200
MAX_CSV_COLUMNS = 256
MAX_CSV_CELLS = 500_000
MAX_CSV_CELL_CHARS = 100_000
MAX_JSON_NODES = 100_000
MAX_JSON_DEPTH = 64
MAX_XML_NODES = 100_000
MAX_XML_DEPTH = 64
MAX_XML_VALUES = 10_000
""",
    1,
)

text = replace_block(
    text,
    "def _extract_csv(data: bytes) -> str:\n",
    "def _extract_json(data: bytes) -> str:\n",
    '''def _extract_csv(data: bytes) -> str:
    text = _decode_text(data)
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\\t;|")
    except csv.Error:
        dialect = csv.excel
    rows: list[list[str]] = []
    cells = 0
    reader = csv.reader(io.StringIO(text), dialect)
    for index, row in enumerate(reader):
        if index >= 5000:
            raise ExtractionError("RICH_CSV_ROW_LIMIT_EXCEEDED", "CSV exceeds the 5000-row extraction limit")
        if len(row) > MAX_CSV_COLUMNS:
            raise ExtractionError(
                "RICH_CSV_COLUMN_LIMIT_EXCEEDED",
                f"CSV exceeds the {MAX_CSV_COLUMNS}-column extraction limit",
            )
        cells += len(row)
        if cells > MAX_CSV_CELLS:
            raise ExtractionError(
                "RICH_CSV_CELL_LIMIT_EXCEEDED",
                f"CSV exceeds the {MAX_CSV_CELLS}-cell extraction limit",
            )
        if any(len(cell) > MAX_CSV_CELL_CHARS for cell in row):
            raise ExtractionError(
                "RICH_CSV_CELL_SIZE_EXCEEDED",
                f"CSV contains a cell larger than {MAX_CSV_CELL_CHARS} characters",
            )
        rows.append([cell for cell in row])
    if not rows or not any(any(cell.strip() for cell in row) for row in rows):
        raise ExtractionError("RICH_CSV_EMPTY", "CSV contains no extractable cells")
    return _markdown_table(rows)''',
)

text = replace_block(
    text,
    "def _extract_json(data: bytes) -> str:\n",
    "def _local_name(tag: str) -> str:\n",
    '''def _assert_json_complexity(value: object) -> None:
    nodes = 0
    stack: list[tuple[object, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        nodes += 1
        if nodes > MAX_JSON_NODES:
            raise ExtractionError(
                "RICH_JSON_NODE_LIMIT_EXCEEDED",
                f"JSON exceeds the {MAX_JSON_NODES}-node extraction limit",
            )
        if depth > MAX_JSON_DEPTH:
            raise ExtractionError(
                "RICH_JSON_DEPTH_LIMIT_EXCEEDED",
                f"JSON exceeds the {MAX_JSON_DEPTH}-level extraction limit",
            )
        if isinstance(current, dict):
            stack.extend((item, depth + 1) for item in current.values())
        elif isinstance(current, list):
            stack.extend((item, depth + 1) for item in current)


def _extract_json(data: bytes) -> str:
    text = _decode_text(data)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractionError("RICH_JSON_INVALID", f"JSON parse failed: {exc.msg}") from exc
    except RecursionError as exc:
        raise ExtractionError(
            "RICH_JSON_DEPTH_LIMIT_EXCEEDED",
            f"JSON exceeds the {MAX_JSON_DEPTH}-level extraction limit",
        ) from exc
    _assert_json_complexity(value)
    rendered = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    return f"```json\\n{rendered}\\n```"''',
)

xml_helper = '''def _parse_xml_document(data: bytes, code_prefix: str, label: str) -> ET.Element:
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ExtractionError(
            f"{code_prefix}_DTD_FORBIDDEN",
            f"{label} DTD/entity declarations are not allowed",
        )
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ExtractionError(f"{code_prefix}_INVALID", f"{label} parse failed: {exc}") from exc
    nodes = 0
    stack: list[tuple[ET.Element, int]] = [(root, 1)]
    while stack:
        node, depth = stack.pop()
        nodes += 1
        if nodes > MAX_XML_NODES:
            raise ExtractionError(
                f"{code_prefix}_NODE_LIMIT_EXCEEDED",
                f"{label} exceeds the {MAX_XML_NODES}-node extraction limit",
            )
        if depth > MAX_XML_DEPTH:
            raise ExtractionError(
                f"{code_prefix}_DEPTH_LIMIT_EXCEEDED",
                f"{label} exceeds the {MAX_XML_DEPTH}-level extraction limit",
            )
        stack.extend((child, depth + 1) for child in reversed(list(node)))
    return root


'''
anchor = "def _extract_xml(data: bytes) -> str:\n"
text = text.replace(anchor, xml_helper + anchor, 1)
text = replace_block(
    text,
    "def _extract_xml(data: bytes) -> str:\n",
    "def _docx_text(node: ET.Element) -> str:\n",
    '''def _extract_xml(data: bytes) -> str:
    root = _parse_xml_document(data, "RICH_XML", "XML")
    lines = [f"# {_local_name(root.tag)}"]
    values = 0
    stack: list[tuple[ET.Element, list[str]]] = [(root, [])]
    while stack:
        node, path = stack.pop()
        name = _local_name(node.tag)
        next_path = path + [name]
        text_value = (node.text or "").strip()
        if text_value:
            values += 1
            if values > MAX_XML_VALUES:
                raise ExtractionError(
                    "RICH_XML_VALUE_LIMIT_EXCEEDED",
                    f"XML exceeds the {MAX_XML_VALUES}-value extraction limit",
                )
            lines.append(f"- `{' / '.join(next_path)}`: {text_value}")
        for key, value in sorted(node.attrib.items()):
            values += 1
            if values > MAX_XML_VALUES:
                raise ExtractionError(
                    "RICH_XML_VALUE_LIMIT_EXCEEDED",
                    f"XML exceeds the {MAX_XML_VALUES}-value extraction limit",
                )
            lines.append(f"- `{' / '.join(next_path)} / @{_local_name(key)}`: {value}")
        stack.extend((child, next_path) for child in reversed(list(node)))
    if len(lines) == 1:
        raise ExtractionError("RICH_XML_EMPTY", "XML contains no extractable text or attributes")
    return _normalize_markdown("\\n".join(lines))''',
)

archive_helpers = '''def _validate_ooxml_archive(archive: zipfile.ZipFile, kind: str) -> None:
    infos = archive.infolist()
    if not infos or len(infos) > MAX_ARCHIVE_MEMBERS:
        raise ExtractionError(
            f"RICH_{kind}_ARCHIVE_MEMBER_LIMIT_EXCEEDED",
            f"{kind} archive exceeds the {MAX_ARCHIVE_MEMBERS}-member limit",
        )
    total_uncompressed = 0
    for info in infos:
        name = info.filename
        normalized = name.rstrip("/")
        parts = normalized.split("/") if normalized else []
        if (
            not normalized
            or "\\\\" in name
            or "\\x00" in name
            or name.startswith("/")
            or re.match(r"^[A-Za-z]:", name)
            or any(part in {"", ".", ".."} for part in parts)
        ):
            raise ExtractionError(
                f"RICH_{kind}_ARCHIVE_PATH_INVALID",
                f"{kind} archive contains an unsafe member path",
            )
        unix_type = (info.external_attr >> 16) & 0o170000
        if unix_type == 0o120000:
            raise ExtractionError(
                f"RICH_{kind}_ARCHIVE_SYMLINK_FORBIDDEN",
                f"{kind} archive contains a symbolic-link member",
            )
        if info.flag_bits & 0x1:
            raise ExtractionError(
                f"RICH_{kind}_ARCHIVE_ENCRYPTED",
                f"{kind} archive contains an encrypted member",
            )
        if info.is_dir():
            continue
        if info.file_size > MAX_ARCHIVE_MEMBER_BYTES:
            raise ExtractionError(
                f"RICH_{kind}_ARCHIVE_MEMBER_TOO_LARGE",
                f"{kind} archive contains a member larger than {MAX_ARCHIVE_MEMBER_BYTES} bytes",
            )
        total_uncompressed += info.file_size
        if total_uncompressed > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
            raise ExtractionError(
                f"RICH_{kind}_ARCHIVE_TOO_LARGE",
                f"{kind} archive exceeds the {MAX_ARCHIVE_UNCOMPRESSED_BYTES}-byte expanded limit",
            )
        if info.file_size > 0:
            if info.compress_size <= 0 or info.file_size / info.compress_size > MAX_ARCHIVE_COMPRESSION_RATIO:
                raise ExtractionError(
                    f"RICH_{kind}_ARCHIVE_COMPRESSION_RATIO_EXCEEDED",
                    f"{kind} archive contains a suspiciously compressed member",
                )


def _read_archive_member(archive: zipfile.ZipFile, name: str, kind: str) -> bytes:
    try:
        info = archive.getinfo(name)
    except KeyError as exc:
        raise ExtractionError(f"RICH_{kind}_INVALID", f"{kind} package is missing {name}") from exc
    if info.is_dir() or info.file_size > MAX_ARCHIVE_MEMBER_BYTES:
        raise ExtractionError(
            f"RICH_{kind}_ARCHIVE_MEMBER_TOO_LARGE",
            f"{kind} package member {name} is outside governed limits",
        )
    data = archive.read(info)
    if len(data) != info.file_size:
        raise ExtractionError(
            f"RICH_{kind}_ARCHIVE_EVIDENCE_MISMATCH",
            f"{kind} package member size changed during extraction",
        )
    return data


'''
anchor = "def _extract_docx(data: bytes) -> str:\n"
text = text.replace(anchor, archive_helpers + anchor, 1)
text = replace_block(
    text,
    "def _extract_docx(data: bytes) -> str:\n",
    "def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:\n",
    '''def _extract_docx(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            _validate_ooxml_archive(archive, "DOCX")
            document = _read_archive_member(archive, "word/document.xml", "DOCX")
    except zipfile.BadZipFile as exc:
        raise ExtractionError("RICH_DOCX_INVALID", "DOCX package is invalid") from exc
    root = _parse_xml_document(document, "RICH_DOCX_XML", "DOCX document XML")

    blocks: list[str] = []
    for node in root.iter():
        name = _local_name(node.tag)
        if name == "p":
            text_value = _docx_text(node)
            if not text_value:
                continue
            style = ""
            for descendant in node.iter():
                if _local_name(descendant.tag) == "pStyle":
                    style = next((v for k, v in descendant.attrib.items() if _local_name(k) == "val"), "")
                    break
            heading = re.fullmatch(r"Heading([1-6])", style, re.IGNORECASE)
            blocks.append(f"{'#' * int(heading.group(1))} {text_value}" if heading else text_value)
        elif name == "tbl":
            rows: list[list[str]] = []
            for tr in list(node):
                if _local_name(tr.tag) != "tr":
                    continue
                row: list[str] = []
                for tc in list(tr):
                    if _local_name(tc.tag) == "tc":
                        row.append(_docx_text(tc))
                if row:
                    rows.append(row)
            if rows:
                blocks.append(_markdown_table(rows))
    if not blocks:
        raise ExtractionError("RICH_DOCX_EMPTY", "DOCX contains no extractable text")
    return _normalize_markdown("\\n\\n".join(blocks))''',
)

text = replace_block(
    text,
    "def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:\n",
    "def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[str, str]:\n",
    '''def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        archive.getinfo("xl/sharedStrings.xml")
    except KeyError:
        return []
    data = _read_archive_member(archive, "xl/sharedStrings.xml", "XLSX")
    root = _parse_xml_document(data, "RICH_XLSX_XML", "XLSX shared strings XML")
    result: list[str] = []
    for si in root:
        if _local_name(si.tag) != "si":
            continue
        result.append("".join((node.text or "") for node in si.iter() if _local_name(node.tag) == "t"))
    return result''',
)

text = replace_block(
    text,
    "def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[str, str]:\n",
    "def _xlsx_cell_value(cell: ET.Element, shared: list[str]) -> str:\n",
    '''def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[str, str]:
    names: dict[str, str] = {}
    try:
        workbook_data = _read_archive_member(archive, "xl/workbook.xml", "XLSX")
        rels_data = _read_archive_member(archive, "xl/_rels/workbook.xml.rels", "XLSX")
    except ExtractionError:
        return names
    workbook = _parse_xml_document(workbook_data, "RICH_XLSX_XML", "XLSX workbook XML")
    rels = _parse_xml_document(rels_data, "RICH_XLSX_XML", "XLSX relationships XML")
    rel_targets: dict[str, str] = {}
    for rel in rels:
        rel_id = next((v for k, v in rel.attrib.items() if _local_name(k) == "Id"), None)
        target = next((v for k, v in rel.attrib.items() if _local_name(k) == "Target"), None)
        if rel_id and target:
            target = target.lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            rel_targets[rel_id] = target
    for sheet in workbook.iter():
        if _local_name(sheet.tag) != "sheet":
            continue
        title = sheet.attrib.get("name", "Sheet")
        rel_id = next((v for k, v in sheet.attrib.items() if _local_name(k) == "id"), None)
        if rel_id and rel_id in rel_targets:
            names[rel_targets[rel_id]] = title
    return names''',
)

text = replace_block(
    text,
    "def _extract_xlsx(data: bytes) -> str:\n",
    "def _extract_email(data: bytes) -> str:\n",
    '''def _extract_xlsx(data: bytes) -> str:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ExtractionError("RICH_XLSX_INVALID", "XLSX package is invalid") from exc
    with archive:
        _validate_ooxml_archive(archive, "XLSX")
        shared = _xlsx_shared_strings(archive)
        names = _xlsx_sheet_names(archive)
        sheet_paths = sorted(
            path for path in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\\d+\\.xml", path)
        )
        blocks: list[str] = []
        total_rows = 0
        for index, sheet_path in enumerate(sheet_paths, start=1):
            data_xml = _read_archive_member(archive, sheet_path, "XLSX")
            root = _parse_xml_document(data_xml, "RICH_XLSX_XML", "XLSX worksheet XML")
            rows: list[list[str]] = []
            for row_node in root.iter():
                if _local_name(row_node.tag) != "row":
                    continue
                row = [_xlsx_cell_value(cell, shared) for cell in list(row_node) if _local_name(cell.tag) == "c"]
                if len(row) > MAX_CSV_COLUMNS:
                    raise ExtractionError(
                        "RICH_XLSX_COLUMN_LIMIT_EXCEEDED",
                        f"XLSX exceeds the {MAX_CSV_COLUMNS}-column extraction limit",
                    )
                if row:
                    rows.append(row)
                    total_rows += 1
                    if total_rows > 10000:
                        raise ExtractionError("RICH_XLSX_ROW_LIMIT_EXCEEDED", "XLSX exceeds the 10000-row extraction limit")
            if rows:
                blocks.append(f"# {names.get(sheet_path, f'Sheet {index}')}\\n\\n{_markdown_table(rows)}")
        if not blocks:
            raise ExtractionError("RICH_XLSX_EMPTY", "XLSX contains no extractable cells")
        return _normalize_markdown("\\n\\n".join(blocks))''',
)

text = replace_block(
    text,
    "def _run_fixed(command: list[str], timeout_seconds: int, code: str) -> subprocess.CompletedProcess[str]:\n",
    "def _ocr_image(path: Path, languages: list[str], timeout_seconds: int) -> str:\n",
    '''def _run_fixed(command: list[str], timeout_seconds: int, code: str) -> subprocess.CompletedProcess[str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key in {"PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TESSDATA_PREFIX"}
    }
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            env=environment,
        )
    except FileNotFoundError as exc:
        raise ExtractionError(f"{code}_UNAVAILABLE", f"Required executable is unavailable: {command[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ExtractionError(f"{code}_TIMEOUT", f"Extraction command timed out: {command[0]}", True) from exc
    except subprocess.CalledProcessError as exc:
        diagnostic = (exc.stderr or "").strip()[:1000]
        raise ExtractionError(f"{code}_FAILED", diagnostic or f"Extraction command failed: {command[0]}") from exc


def _pdf_text_extract(path: Path, timeout_seconds: int, max_pages: int) -> tuple[str, str, int]:
    with path.open("rb") as handle:
        if handle.read(5) != b"%PDF-":
            raise ExtractionError("PDF_TEXT_HEADER_INVALID", "PDF text extraction requires a valid PDF header")
    pdfinfo = os.environ.get("MARKORBIT_PDFINFO_EXECUTABLE", "pdfinfo")
    info = _run_fixed([pdfinfo, str(path)], timeout_seconds, "PDF_INFO")
    encrypted = re.search(r"^Encrypted:\\s*(yes|no)\\s*$", info.stdout, flags=re.IGNORECASE | re.MULTILINE)
    if encrypted and encrypted.group(1).lower() == "yes":
        raise ExtractionError("PDF_TEXT_ENCRYPTED", "Encrypted/password-protected PDFs are not supported")
    pages_match = re.search(r"^Pages:\\s*(\\d+)\\s*$", info.stdout, flags=re.IGNORECASE | re.MULTILINE)
    if not pages_match:
        raise ExtractionError("PDF_INFO_INVALID", "PDF metadata did not report a deterministic page count")
    pages = int(pages_match.group(1))
    if pages <= 0:
        raise ExtractionError("PDF_INFO_INVALID", "PDF metadata reported an invalid page count")
    if pages > max_pages:
        raise ExtractionError("PDF_TEXT_PAGE_LIMIT_EXCEEDED", f"PDF exceeds the {max_pages}-page text extraction limit")

    pdftotext = os.environ.get("MARKORBIT_PDFTOTEXT_EXECUTABLE", "pdftotext")
    completed = _run_fixed(
        [
            pdftotext,
            "-f",
            "1",
            "-l",
            str(pages),
            "-layout",
            "-enc",
            "UTF-8",
            str(path),
            "-",
        ],
        timeout_seconds,
        "PDF_TEXT_ENGINE",
    )
    markdown = _normalize_markdown(completed.stdout)
    if not markdown:
        raise ExtractionError(
            "PDF_TEXT_NO_EXTRACTABLE_TEXT",
            "PDF contains no extractable text layer; explicit OCR is required",
        )
    return markdown, "PDFTOTEXT_TEXT_LAYER", pages''',
)

text = text.replace(
    '    if value["mode"] not in {"RICH", "OCR"}:\n        raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "mode must be RICH or OCR")\n',
    '    if value["mode"] not in {"RICH", "PDF_TEXT", "OCR"}:\n        raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "mode must be RICH, PDF_TEXT, or OCR")\n',
    1,
)

old_dispatch = '''        data = input_path.read_bytes()
        if request["mode"] == "RICH":
            markdown, method = _rich_extract(str(request["artifactKind"]), str(request["mimeType"]), data)
            page_count = None
        else:
            markdown, method, page_count = _ocr_extract(
                str(request["artifactKind"]),
                str(request["mimeType"]),
                input_path,
                languages,
                timeout_seconds,
                max_pages,
            )
'''
new_dispatch = '''        if request["mode"] == "RICH":
            data = input_path.read_bytes()
            markdown, method = _rich_extract(str(request["artifactKind"]), str(request["mimeType"]), data)
            page_count = None
        elif request["mode"] == "PDF_TEXT":
            if str(request["artifactKind"]) != "PDF" or str(request["mimeType"]).lower() != "application/pdf":
                raise ExtractionError(
                    "PDF_TEXT_INPUT_UNSUPPORTED",
                    f"Unsupported PDF text input: {request['artifactKind']} / {request['mimeType']}",
                )
            markdown, method, page_count = _pdf_text_extract(input_path, timeout_seconds, max_pages)
        else:
            markdown, method, page_count = _ocr_extract(
                str(request["artifactKind"]),
                str(request["mimeType"]),
                input_path,
                languages,
                timeout_seconds,
                max_pages,
            )
'''
if old_dispatch not in text:
    raise SystemExit("extract main dispatch anchor missing")
text = text.replace(old_dispatch, new_dispatch, 1)
path.write_text(text)


# ---------------------------------------------------------------------------
# Node adapter: add explicit local PDF text mode/provider.
# ---------------------------------------------------------------------------
path = Path("packages/worker-runtime/src/local-document-extraction.ts")
text = path.read_text()
text = text.replace(
    '''export const PRODUCTION_OCR_MARKDOWN_CONVERTER = {
  converterId: "local-ocr-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;
''',
    '''export const PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER = {
  converterId: "local-pdf-text-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;

export const PRODUCTION_OCR_MARKDOWN_CONVERTER = {
  converterId: "local-ocr-markdown",
  version: "1.0.0",
} as const satisfies RuntimeConverterRef;
''',
    1,
)
text = text.replace(
    'const OCR_KINDS = new Set<ArtifactKind>(["PDF", "IMAGE"]);\n',
    'const PDF_TEXT_KINDS = new Set<ArtifactKind>(["PDF"]);\nconst OCR_KINDS = new Set<ArtifactKind>(["PDF", "IMAGE"]);\n',
    1,
)
text = text.replace(
    'export type LocalDocumentExtractionMode = "RICH" | "OCR";\n',
    'export type LocalDocumentExtractionMode = "RICH" | "PDF_TEXT" | "OCR";\n',
    1,
)
text = text.replace(
    '    "MARKORBIT_PDFTOPPM_EXECUTABLE",\n',
    '    "MARKORBIT_PDFTOPPM_EXECUTABLE",\n    "MARKORBIT_PDFTOTEXT_EXECUTABLE",\n    "MARKORBIT_PDFINFO_EXECUTABLE",\n',
    1,
)
text = text.replace(
    '''  if (request.mode === "OCR" && !OCR_KINDS.has(request.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${request.artifactKind} is not supported by OCR extraction`,
    );
  }
''',
    '''  if (request.mode === "PDF_TEXT" && !PDF_TEXT_KINDS.has(request.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "PDF_TEXT_INPUT_UNSUPPORTED",
      `Artifact kind ${request.artifactKind} is not supported by PDF text extraction`,
    );
  }
  if (request.mode === "OCR" && !OCR_KINDS.has(request.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${request.artifactKind} is not supported by OCR extraction`,
    );
  }
''',
    1,
)
text = text.replace(
    '''  if (
    converter.converterId === PRODUCTION_OCR_MARKDOWN_CONVERTER.converterId &&
    converter.version === PRODUCTION_OCR_MARKDOWN_CONVERTER.version
  ) {
    return "OCR";
  }
''',
    '''  if (
    converter.converterId === PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER.converterId &&
    converter.version === PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER.version
  ) {
    return "PDF_TEXT";
  }
  if (
    converter.converterId === PRODUCTION_OCR_MARKDOWN_CONVERTER.converterId &&
    converter.version === PRODUCTION_OCR_MARKDOWN_CONVERTER.version
  ) {
    return "OCR";
  }
''',
    1,
)
text = text.replace(
    '''  if (mode === "OCR" && !OCR_KINDS.has(metadata.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${metadata.artifactKind} is not supported by the OCR extractor`,
    );
  }
''',
    '''  if (mode === "PDF_TEXT" && !PDF_TEXT_KINDS.has(metadata.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "PDF_TEXT_INPUT_UNSUPPORTED",
      `Artifact kind ${metadata.artifactKind} is not supported by the PDF text extractor`,
    );
  }
  if (mode === "OCR" && !OCR_KINDS.has(metadata.artifactKind)) {
    throw new LocalDocumentExtractionError(
      "OCR_INPUT_UNSUPPORTED",
      `Artifact kind ${metadata.artifactKind} is not supported by the OCR extractor`,
    );
  }
''',
    1,
)
text = text.replace(
    '''          message:
            mode === "OCR"
              ? "Running governed OCR extraction"
              : "Running governed rich document extraction",
''',
    '''          message:
            mode === "OCR"
              ? "Running governed OCR extraction"
              : mode === "PDF_TEXT"
                ? "Running governed PDF text-layer extraction"
                : "Running governed rich document extraction",
''',
    1,
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Production conversion Worker routing/capability advertisement.
# ---------------------------------------------------------------------------
path = Path("packages/worker-runtime/src/production-conversion-worker-runtime.ts")
text = path.read_text()
text = text.replace(
    '  PRODUCTION_OCR_MARKDOWN_CONVERTER,\n',
    '  PRODUCTION_OCR_MARKDOWN_CONVERTER,\n  PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER,\n',
    1,
)
text = text.replace(
    '  PRODUCTION_PDF_MARKDOWN_CONVERTER,\n  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n',
    '  PRODUCTION_PDF_MARKDOWN_CONVERTER,\n  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n',
    1,
)
text = text.replace(
    '  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n  PRODUCTION_OCR_MARKDOWN_CONVERTER,\n',
    '  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n  PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER,\n  PRODUCTION_OCR_MARKDOWN_CONVERTER,\n',
    1,
)
text = text.replace(
    '''      converterId === PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER.converterId ||
      converterId === PRODUCTION_OCR_MARKDOWN_CONVERTER.converterId
''',
    '''      converterId === PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER.converterId ||
      converterId === PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER.converterId ||
      converterId === PRODUCTION_OCR_MARKDOWN_CONVERTER.converterId
''',
    1,
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Converter catalog/source-supply: provision new provider without silently
# migrating existing automatic PDF profiles.
# ---------------------------------------------------------------------------
path = Path("apps/worker/src/source-supply-conversion.ts")
text = path.read_text()
text = text.replace(
    '  key: "MARKDOWN" | "PDF" | "RICH" | "IMAGE";\n',
    '  key: "MARKDOWN" | "PDF" | "PDF_TEXT" | "RICH" | "IMAGE";\n',
    1,
)
pdf_spec_end = '''  {
    key: "PDF",
    converterId: "builtin-pdf-markdown",
    version: "1.0.0",
    displayName: "Built-in PDF to Markdown — Production",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "PRESERVE_LINKS"],
    artifactKinds: ["PDF"],
    mimePatterns: ["application/pdf"],
    maxInputBytes: 12_000_000,
    timeoutSeconds: 60,
    precedence: 900,
  },
'''
if pdf_spec_end not in text:
    raise SystemExit("PDF converter spec anchor missing")
text = text.replace(
    pdf_spec_end,
    pdf_spec_end
    + '''  {
    key: "PDF_TEXT",
    converterId: "local-pdf-text-markdown",
    version: "1.0.0",
    displayName: "Local Poppler PDF Text Layer to Markdown — Production",
    runtime: "LOCAL_PROCESS",
    capabilities: ["CONVERT", "PRESERVE_LINKS"],
    artifactKinds: ["PDF"],
    mimePatterns: ["application/pdf"],
    maxInputBytes: 25_000_000,
    timeoutSeconds: 180,
    precedence: 950,
  },
''',
    1,
)
text = text.replace(
    '''  if (spec.key === "PDF") {
    return expected.has("PDF")
      ? { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] }
      : null;
  }
''',
    '''  // Preserve the already-frozen automatic PDF path. The production Poppler
  // provider is provisioned as an opt-in exact converter so existing deployments
  // do not silently create a second ConversionRun for the same attachment.
  if (spec.key === "PDF_TEXT") return null;
  if (spec.key === "PDF") {
    return expected.has("PDF")
      ? { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] }
      : null;
  }
''',
    1,
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Python adversarial/provider tests.
# ---------------------------------------------------------------------------
path = Path("workers/document_extraction/tests/test_extract.py")
text = path.read_text()
marker = "    def test_main_writes_bounded_body_and_hash(self) -> None:\n"
addition = '''    def test_rich_inputs_fail_closed_on_complexity_and_archive_bombs(self) -> None:
        wide_csv = (",".join(f"c{index}" for index in range(extract.MAX_CSV_COLUMNS + 1)) + "\\n").encode()
        with self.assertRaises(extract.ExtractionError) as csv_error:
            extract._extract_csv(wide_csv)
        self.assertEqual(csv_error.exception.code, "RICH_CSV_COLUMN_LIMIT_EXCEEDED")

        nested: object = "value"
        for _ in range(extract.MAX_JSON_DEPTH + 1):
            nested = [nested]
        with self.assertRaises(extract.ExtractionError) as json_error:
            extract._extract_json(json.dumps(nested).encode())
        self.assertEqual(json_error.exception.code, "RICH_JSON_DEPTH_LIMIT_EXCEEDED")

        xml = b'''<!DOCTYPE root [<!ENTITY x "expanded">]><root>&x;</root>'''
        with self.assertRaises(extract.ExtractionError) as xml_error:
            extract._extract_xml(xml)
        self.assertEqual(xml_error.exception.code, "RICH_XML_DTD_FORBIDDEN")

        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", b"A" * 2_000_000)
        with self.assertRaises(extract.ExtractionError) as archive_error:
            extract._extract_docx(buffer.getvalue())
        self.assertEqual(
            archive_error.exception.code,
            "RICH_DOCX_ARCHIVE_COMPRESSION_RATIO_EXCEEDED",
        )

    def test_pdf_text_layer_uses_fixed_poppler_commands(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "input.pdf"
            pdf.write_bytes(b"%PDF-1.7\\nsynthetic fixture")
            pdfinfo = root / "fake-pdfinfo"
            pdfinfo.write_text(
                "#!/usr/bin/env python3\\nprint('Pages: 2')\\nprint('Encrypted: no')\\n",
                encoding="utf-8",
            )
            pdftotext = root / "fake-pdftotext"
            pdftotext.write_text(
                "#!/usr/bin/env python3\\nprint('Official PDF text layer')\\n",
                encoding="utf-8",
            )
            pdfinfo.chmod(pdfinfo.stat().st_mode | stat.S_IXUSR)
            pdftotext.chmod(pdftotext.stat().st_mode | stat.S_IXUSR)
            previous_info = os.environ.get("MARKORBIT_PDFINFO_EXECUTABLE")
            previous_text = os.environ.get("MARKORBIT_PDFTOTEXT_EXECUTABLE")
            os.environ["MARKORBIT_PDFINFO_EXECUTABLE"] = str(pdfinfo)
            os.environ["MARKORBIT_PDFTOTEXT_EXECUTABLE"] = str(pdftotext)
            try:
                body, method, pages = extract._pdf_text_extract(pdf, 10, 5)
            finally:
                if previous_info is None:
                    os.environ.pop("MARKORBIT_PDFINFO_EXECUTABLE", None)
                else:
                    os.environ["MARKORBIT_PDFINFO_EXECUTABLE"] = previous_info
                if previous_text is None:
                    os.environ.pop("MARKORBIT_PDFTOTEXT_EXECUTABLE", None)
                else:
                    os.environ["MARKORBIT_PDFTOTEXT_EXECUTABLE"] = previous_text
            self.assertEqual(body, "Official PDF text layer")
            self.assertEqual(method, "PDFTOTEXT_TEXT_LAYER")
            self.assertEqual(pages, 2)

'''
if marker not in text:
    raise SystemExit("Python test marker missing")
text = text.replace(marker, addition + marker, 1)
path.write_text(text)


# ---------------------------------------------------------------------------
# Node exact-binding test for the new converter.
# ---------------------------------------------------------------------------
path = Path("packages/worker-runtime/tests/local-document-extraction.test.ts")
text = path.read_text()
text = text.replace(
    '  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n',
    '  PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER,\n  PRODUCTION_RICH_DOCUMENT_MARKDOWN_CONVERTER,\n',
    1,
)
marker = '  it("fails closed when extractor attempts to inject canonical frontmatter", async () => {\n'
addition = '''  it("binds the opt-in Poppler PDF text provider to PDF_TEXT mode", async () => {
    const input = encoder.encode("%PDF-1.7 synthetic bytes");
    const ctx = richContext(input);
    const converter = PRODUCTION_PDF_TEXT_MARKDOWN_CONVERTER;
    ctx.converter = converter;
    ctx.lease.converter = converter;
    ctx.documentMetadata.converterId = converter.converterId;
    ctx.documentMetadata.converterVersion = converter.version;
    ctx.documentMetadata.artifactKind = "PDF";
    ctx.documentMetadata.originalName = "guide.pdf";
    ctx.inputGrant.expectedMime = "application/pdf";

    const runner: LocalDocumentExtractionRunner = {
      async extract(request) {
        expect(request.mode).toBe("PDF_TEXT");
        expect(request.artifactKind).toBe("PDF");
        return {
          body: encoder.encode("# PDF text\\n\\nOfficial text layer.\\n"),
          extractionMethod: "PDFTOTEXT_TEXT_LAYER",
          pageCount: 2,
        };
      },
    };
    const client: ProductionConversionRuntimeClient = {
      async started() {},
      async progress() {},
      async outputReady() {},
      async failed() {
        throw new Error("unexpected failure");
      },
    };
    const reader: ProductionRawArtifactReader = {
      async read() {
        return input;
      },
    };
    const uploader: ProductionStagingUploader = {
      async upload(_context, markdown) {
        expect(new TextDecoder().decode(markdown)).toContain(
          'converterId: "local-pdf-text-markdown"',
        );
        return {
          stagingDocumentId: "std_01H00000000000000000000000",
          stagingStatus: "READY",
          verificationOutcome: "PASS",
          finalizationDecision: "COMPLETED",
        };
      },
    };

    const result = await new ProductionLocalDocumentExtractionExecutor(runner).execute(
      ctx,
      reader,
      uploader,
      client,
    );
    expect(result?.commit.finalizationDecision).toBe("COMPLETED");
  });

'''
if marker not in text:
    raise SystemExit("Node local extraction test marker missing")
text = text.replace(marker, addition + marker, 1)
path.write_text(text)


# ---------------------------------------------------------------------------
# Source-supply tests: catalog grows by one, automatic profile count frozen.
# ---------------------------------------------------------------------------
path = Path("apps/worker/tests/source-supply-conversion.test.ts")
text = path.read_text()
text = text.replace("expect(result.manifestCount).toBe(4);", "expect(result.manifestCount).toBe(5);", 1)
second_anchor = "expect(result.profileCount).toBe(4);"
if second_anchor not in text:
    raise SystemExit("source supply profile count anchor missing")
text = text.replace(
    second_anchor,
    '''expect(result.manifestCount).toBe(5);
    expect(result.profileCount).toBe(4);
    expect(control.manifests).toContainEqual(
      expect.objectContaining({
        converterId: "local-pdf-text-markdown",
        runtime: "LOCAL_PROCESS",
        inputs: { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] },
      }),
    );''',
    1,
)
path.write_text(text)


# ---------------------------------------------------------------------------
# Architecture / operations documentation and README status.
# ---------------------------------------------------------------------------
doc = Path("docs/architecture/DOCUMENT_EXTRACTION_PRODUCTION_HARDENING_V1.md")
doc.write_text('''# Document Extraction Production Hardening V1

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
''')

path = Path("README.md")
text = path.read_text()
bullet_anchor = "- production Local Folder Worker ingestion with Worker-local root aliases, root-scoped connector scheduling, traversal/symlink fail-closed controls, stable snapshot digests, bounded scans and immutable RawArtifact/CAS reuse;\n"
bullet = "- production attachment/document normalization for PDF, DOCX, XLSX, CSV, JSON, XML, EMAIL, TEXT and IMAGE with bounded OOXML/structured-input hardening, explicit Poppler PDF text-layer extraction and separate OCR provenance;\n"
if bullet not in text:
    if bullet_anchor not in text:
        raise SystemExit("README Local Folder bullet anchor missing")
    text = text.replace(bullet_anchor, bullet_anchor + bullet, 1)
docs_anchor = "- [Local Folder Worker Ingestion V1](docs/architecture/LOCAL_FOLDER_WORKER_INGESTION_V1.md)\n"
docs_link = "- [Document Extraction Production Hardening V1](docs/architecture/DOCUMENT_EXTRACTION_PRODUCTION_HARDENING_V1.md)\n"
if docs_link not in text:
    if docs_anchor not in text:
        raise SystemExit("README docs anchor missing")
    text = text.replace(docs_anchor, docs_anchor + docs_link, 1)
path.write_text(text)

print("K-EXT-C patch applied")
