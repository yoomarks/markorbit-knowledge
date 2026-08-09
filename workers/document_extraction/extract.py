#!/usr/bin/env python3
"""Controlled local document extraction worker for MarkOrbit Knowledge.

The worker accepts one JSON request on stdin, reads an immutable input file,
produces a Markdown *body* file, and returns a bounded JSON result on stdout.
Canonical frontmatter is deliberately not generated here; the Node control path
adds and verifies provenance separately.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

PROTOCOL_VERSION = "1.0"
MAX_INPUT_BYTES = 25_000_000
DEFAULT_MAX_OUTPUT_BYTES = 8_000_000
DEFAULT_MAX_PAGES = 80
DEFAULT_TIMEOUT_SECONDS = 180

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

LANGUAGE_MAP = {
    "en": "eng",
    "en-us": "eng",
    "en-gb": "eng",
    "zh": "chi_sim",
    "zh-cn": "chi_sim",
    "zh-hans": "chi_sim",
    "zh-tw": "chi_tra",
    "zh-hant": "chi_tra",
    "ja": "jpn",
    "ko": "kor",
    "de": "deu",
    "fr": "fra",
    "es": "spa",
    "pt": "por",
    "it": "ita",
    "ru": "rus",
    "ar": "ara",
}


class ExtractionError(Exception):
    def __init__(self, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


def _response_error(error: ExtractionError) -> dict[str, object]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "ok": False,
        "error": {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable,
        },
    }


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _normalize_markdown(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _escape_cell(value: str) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    return value.replace("|", "\\|")


def _markdown_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    padded = [row + [""] * (width - len(row)) for row in rows]
    header = padded[0]
    lines = [
        "| " + " | ".join(_escape_cell(cell) for cell in header) + " |",
        "| " + " | ".join("---" for _ in range(width)) + " |",
    ]
    for row in padded[1:]:
        lines.append("| " + " | ".join(_escape_cell(cell) for cell in row) + " |")
    return "\n".join(lines)


def _decode_text(data: bytes) -> str:
    if data.startswith(b"\xff\xfe"):
        return data.decode("utf-16-le")
    if data.startswith(b"\xfe\xff"):
        return data.decode("utf-16-be")
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ExtractionError("RICH_TEXT_ENCODING_UNSUPPORTED", "Text input is not valid UTF-8/UTF-16") from exc


def _extract_text(data: bytes) -> str:
    text = _decode_text(data)
    if not text.strip():
        raise ExtractionError("RICH_TEXT_EMPTY", "Text input contains no extractable content")
    return _normalize_markdown(text)


def _extract_csv(data: bytes) -> str:
    text = _decode_text(data)
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
    except csv.Error:
        dialect = csv.excel
    rows: list[list[str]] = []
    reader = csv.reader(io.StringIO(text), dialect)
    for index, row in enumerate(reader):
        if index >= 5000:
            raise ExtractionError("RICH_CSV_ROW_LIMIT_EXCEEDED", "CSV exceeds the 5000-row extraction limit")
        rows.append([cell for cell in row])
    if not rows or not any(any(cell.strip() for cell in row) for row in rows):
        raise ExtractionError("RICH_CSV_EMPTY", "CSV contains no extractable cells")
    return _markdown_table(rows)


def _extract_json(data: bytes) -> str:
    text = _decode_text(data)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractionError("RICH_JSON_INVALID", f"JSON parse failed: {exc.msg}") from exc
    rendered = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    return f"```json\n{rendered}\n```"


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _extract_xml(data: bytes) -> str:
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise ExtractionError("RICH_XML_INVALID", f"XML parse failed: {exc}") from exc

    lines = [f"# {_local_name(root.tag)}"]
    leaves = 0

    def walk(node: ET.Element, path: list[str]) -> None:
        nonlocal leaves
        name = _local_name(node.tag)
        next_path = path + [name]
        children = list(node)
        text = (node.text or "").strip()
        if text:
            leaves += 1
            if leaves > 10000:
                raise ExtractionError("RICH_XML_NODE_LIMIT_EXCEEDED", "XML exceeds the 10000-value extraction limit")
            lines.append(f"- `{' / '.join(next_path)}`: {text}")
        for key, value in sorted(node.attrib.items()):
            leaves += 1
            lines.append(f"- `{' / '.join(next_path)} / @{_local_name(key)}`: {value}")
        for child in children:
            walk(child, next_path)

    walk(root, [])
    if len(lines) == 1:
        raise ExtractionError("RICH_XML_EMPTY", "XML contains no extractable text or attributes")
    return _normalize_markdown("\n".join(lines))


def _docx_text(node: ET.Element) -> str:
    parts: list[str] = []
    for child in node.iter():
        name = _local_name(child.tag)
        if name == "t" and child.text:
            parts.append(child.text)
        elif name == "tab":
            parts.append("\t")
        elif name in {"br", "cr"}:
            parts.append("\n")
    return "".join(parts).strip()


def _extract_docx(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            document = archive.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError) as exc:
        raise ExtractionError("RICH_DOCX_INVALID", "DOCX package or word/document.xml is invalid") from exc
    try:
        root = ET.fromstring(document)
    except ET.ParseError as exc:
        raise ExtractionError("RICH_DOCX_XML_INVALID", "DOCX document XML is invalid") from exc

    blocks: list[str] = []
    for node in root.iter():
        name = _local_name(node.tag)
        if name == "p":
            text = _docx_text(node)
            if not text:
                continue
            style = ""
            for descendant in node.iter():
                if _local_name(descendant.tag) == "pStyle":
                    style = next((v for k, v in descendant.attrib.items() if _local_name(k) == "val"), "")
                    break
            heading = re.fullmatch(r"Heading([1-6])", style, re.IGNORECASE)
            blocks.append(f"{'#' * int(heading.group(1))} {text}" if heading else text)
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
    return _normalize_markdown("\n\n".join(blocks))


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        data = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    result: list[str] = []
    for si in root:
        if _local_name(si.tag) != "si":
            continue
        result.append("".join((node.text or "") for node in si.iter() if _local_name(node.tag) == "t"))
    return result


def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[str, str]:
    names: dict[str, str] = {}
    try:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    except (KeyError, ET.ParseError):
        return names
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
    return names


def _xlsx_cell_value(cell: ET.Element, shared: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    inline = next((node for node in cell.iter() if _local_name(node.tag) == "is"), None)
    if inline is not None:
        return "".join((node.text or "") for node in inline.iter() if _local_name(node.tag) == "t")
    value_node = next((node for node in cell.iter() if _local_name(node.tag) == "v"), None)
    value = (value_node.text or "") if value_node is not None else ""
    if cell_type == "s" and value.isdigit():
        index = int(value)
        return shared[index] if 0 <= index < len(shared) else value
    if cell_type == "b":
        return "TRUE" if value == "1" else "FALSE"
    return value


def _extract_xlsx(data: bytes) -> str:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ExtractionError("RICH_XLSX_INVALID", "XLSX package is invalid") from exc
    with archive:
        shared = _xlsx_shared_strings(archive)
        names = _xlsx_sheet_names(archive)
        sheet_paths = sorted(
            path for path in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", path)
        )
        blocks: list[str] = []
        total_rows = 0
        for index, path in enumerate(sheet_paths, start=1):
            try:
                root = ET.fromstring(archive.read(path))
            except ET.ParseError:
                continue
            rows: list[list[str]] = []
            for row_node in root.iter():
                if _local_name(row_node.tag) != "row":
                    continue
                row = [_xlsx_cell_value(cell, shared) for cell in list(row_node) if _local_name(cell.tag) == "c"]
                if row:
                    rows.append(row)
                    total_rows += 1
                    if total_rows > 10000:
                        raise ExtractionError("RICH_XLSX_ROW_LIMIT_EXCEEDED", "XLSX exceeds the 10000-row extraction limit")
            if rows:
                blocks.append(f"# {names.get(path, f'Sheet {index}')}\n\n{_markdown_table(rows)}")
        if not blocks:
            raise ExtractionError("RICH_XLSX_EMPTY", "XLSX contains no extractable cells")
        return _normalize_markdown("\n\n".join(blocks))


def _extract_email(data: bytes) -> str:
    from email import policy
    from email.parser import BytesParser

    message = BytesParser(policy=policy.default).parsebytes(data)
    lines: list[str] = []
    for header in ("Subject", "From", "To", "Cc", "Date"):
        value = message.get(header)
        if value:
            lines.append(f"**{header}:** {value}")
    body = message.get_body(preferencelist=("plain",)) if message.is_multipart() else message
    if body is not None:
        try:
            content = body.get_content()
        except Exception:
            content = ""
        if isinstance(content, str) and content.strip():
            lines.append(content.strip())
    if not lines:
        raise ExtractionError("RICH_EMAIL_EMPTY", "Email contains no extractable headers or text body")
    return _normalize_markdown("\n\n".join(lines))


def _rich_extract(kind: str, mime: str, data: bytes) -> tuple[str, str]:
    mime = mime.lower()
    if kind == "DOCX" and mime == DOCX_MIME:
        return _extract_docx(data), "DOCX_XML"
    if kind == "XLSX" and mime == XLSX_MIME:
        return _extract_xlsx(data), "XLSX_XML"
    if kind == "CSV" and mime in {"text/csv", "text/plain", "application/csv"}:
        return _extract_csv(data), "CSV_STDLIB"
    if kind == "JSON" and mime in {"application/json", "text/json", "text/plain"}:
        return _extract_json(data), "JSON_STDLIB"
    if kind == "XML" and mime in {"application/xml", "text/xml", "text/plain"}:
        return _extract_xml(data), "XML_STDLIB"
    if kind == "TEXT" and mime.startswith("text/"):
        return _extract_text(data), "TEXT_DECODER"
    if kind == "EMAIL" and mime == "message/rfc822":
        return _extract_email(data), "EMAIL_STDLIB"
    raise ExtractionError("RICH_INPUT_UNSUPPORTED", f"Unsupported rich extraction input: {kind} / {mime}")


def _tesseract_languages(languages: list[str]) -> str:
    mapped: list[str] = []
    for language in languages:
        code = LANGUAGE_MAP.get(language.lower())
        if code and code not in mapped:
            mapped.append(code)
    return "+".join(mapped or ["eng"])


def _run_fixed(command: list[str], timeout_seconds: int, code: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env={
                key: value
                for key, value in os.environ.items()
                if key in {"PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TESSDATA_PREFIX"}
            },
        )
    except FileNotFoundError as exc:
        raise ExtractionError(f"{code}_UNAVAILABLE", f"Required executable is unavailable: {command[0]}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ExtractionError(f"{code}_TIMEOUT", f"Extraction command timed out: {command[0]}", True) from exc
    except subprocess.CalledProcessError as exc:
        diagnostic = (exc.stderr or "").strip()[:1000]
        raise ExtractionError(f"{code}_FAILED", diagnostic or f"Extraction command failed: {command[0]}") from exc


def _ocr_image(path: Path, languages: list[str], timeout_seconds: int) -> str:
    executable = os.environ.get("MARKORBIT_TESSERACT_EXECUTABLE", "tesseract")
    completed = _run_fixed(
        [executable, str(path), "stdout", "-l", _tesseract_languages(languages), "--psm", "6"],
        timeout_seconds,
        "OCR_ENGINE",
    )
    text = _normalize_markdown(completed.stdout)
    if not text:
        raise ExtractionError("OCR_NO_EXTRACTABLE_TEXT", "OCR engine produced no text")
    return text


def _ocr_pdf(path: Path, languages: list[str], timeout_seconds: int, max_pages: int) -> tuple[str, int]:
    pdftoppm = os.environ.get("MARKORBIT_PDFTOPPM_EXECUTABLE", "pdftoppm")
    with tempfile.TemporaryDirectory(prefix="markorbit-ocr-pages-") as directory:
        prefix = str(Path(directory) / "page")
        _run_fixed(
            [pdftoppm, "-png", "-r", "200", "-f", "1", "-l", str(max_pages + 1), str(path), prefix],
            timeout_seconds,
            "PDF_RENDERER",
        )
        pages = sorted(Path(directory).glob("page-*.png"))
        if not pages:
            raise ExtractionError("OCR_PDF_RENDER_EMPTY", "PDF renderer produced no page images")
        if len(pages) > max_pages:
            raise ExtractionError("OCR_PDF_PAGE_LIMIT_EXCEEDED", f"PDF exceeds the {max_pages}-page OCR limit")
        parts: list[str] = []
        for index, page in enumerate(pages, start=1):
            text = _ocr_image(page, languages, timeout_seconds)
            parts.append(f"## Page {index}\n\n{text}")
        return _normalize_markdown("\n\n".join(parts)), len(pages)


def _ocr_extract(kind: str, mime: str, input_path: Path, languages: list[str], timeout_seconds: int, max_pages: int) -> tuple[str, str, int | None]:
    mime = mime.lower()
    if kind == "IMAGE" and mime.startswith("image/"):
        return _ocr_image(input_path, languages, timeout_seconds), "TESSERACT_OCR", 1
    if kind == "PDF" and mime == "application/pdf":
        text, pages = _ocr_pdf(input_path, languages, timeout_seconds, max_pages)
        return text, "PDFTOPPM_TESSERACT_OCR", pages
    raise ExtractionError("OCR_INPUT_UNSUPPORTED", f"Unsupported OCR input: {kind} / {mime}")


def _validate_request(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or value.get("protocolVersion") != PROTOCOL_VERSION:
        raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "Invalid extraction protocol request")
    required = ["inputPath", "outputPath", "artifactKind", "mimeType", "mode"]
    if any(not isinstance(value.get(key), str) or not str(value.get(key)).strip() for key in required):
        raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "Missing extraction request fields")
    if value["mode"] not in {"RICH", "OCR"}:
        raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "mode must be RICH or OCR")
    return value


def main() -> int:
    try:
        request = _validate_request(json.load(sys.stdin))
        input_path = Path(str(request["inputPath"])).resolve()
        output_path = Path(str(request["outputPath"])).resolve()
        if not input_path.is_file():
            raise ExtractionError("DOCUMENT_EXTRACTION_INPUT_NOT_FOUND", "Extraction input file was not found")
        if output_path.parent != input_path.parent:
            raise ExtractionError("DOCUMENT_EXTRACTION_PATH_SCOPE_INVALID", "Output must remain beside the governed input file")
        size = input_path.stat().st_size
        if size <= 0 or size > MAX_INPUT_BYTES:
            raise ExtractionError("DOCUMENT_EXTRACTION_INPUT_SIZE_INVALID", "Extraction input size is outside governed limits")
        max_output = int(request.get("maxOutputBytes", DEFAULT_MAX_OUTPUT_BYTES))
        max_pages = int(request.get("maxPages", DEFAULT_MAX_PAGES))
        timeout_seconds = int(request.get("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS))
        if max_output <= 0 or max_output > DEFAULT_MAX_OUTPUT_BYTES:
            raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "maxOutputBytes is outside governed limits")
        if max_pages <= 0 or max_pages > DEFAULT_MAX_PAGES:
            raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "maxPages is outside governed limits")
        if timeout_seconds <= 0 or timeout_seconds > DEFAULT_TIMEOUT_SECONDS:
            raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "timeoutSeconds is outside governed limits")
        languages = request.get("languages", [])
        if not isinstance(languages, list) or not all(isinstance(item, str) for item in languages):
            raise ExtractionError("DOCUMENT_EXTRACTION_PROTOCOL_INVALID", "languages must be an array of strings")

        data = input_path.read_bytes()
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
        markdown = _normalize_markdown(markdown)
        if not markdown:
            raise ExtractionError("DOCUMENT_EXTRACTION_EMPTY", "Extraction produced no Markdown body")
        output = (markdown + "\n").encode("utf-8")
        if len(output) > max_output:
            raise ExtractionError("DOCUMENT_EXTRACTION_OUTPUT_TOO_LARGE", "Extracted Markdown exceeds the governed output limit")
        output_path.write_bytes(output)
        response: dict[str, object] = {
            "protocolVersion": PROTOCOL_VERSION,
            "ok": True,
            "outputFile": output_path.name,
            "sizeBytes": len(output),
            "sha256": _sha256(output),
            "extractionMethod": method,
        }
        if page_count is not None:
            response["pageCount"] = page_count
        print(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
        return 0
    except ExtractionError as error:
        print(json.dumps(_response_error(error), ensure_ascii=False, separators=(",", ":")))
        return 0
    except Exception as error:  # fail closed without leaking a traceback/provenance path
        failure = ExtractionError("DOCUMENT_EXTRACTION_INTERNAL_ERROR", str(error)[:500], True)
        print(json.dumps(_response_error(failure), ensure_ascii=False, separators=(",", ":")))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
