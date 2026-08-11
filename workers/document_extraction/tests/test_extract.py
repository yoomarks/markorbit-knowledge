from __future__ import annotations

import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import extract  # noqa: E402


class DocumentExtractionTests(unittest.TestCase):
    def test_text_csv_json_and_xml(self) -> None:
        self.assertEqual(extract._extract_text(b"Hello\r\nworld"), "Hello\nworld")
        csv_md = extract._extract_csv(b"Name,Value\nAlpha,1\nBeta,2\n")
        self.assertIn("| Name | Value |", csv_md)
        self.assertIn("| Alpha | 1 |", csv_md)

        json_md = extract._extract_json(b'{"b":2,"a":1}')
        self.assertIn('"a": 1', json_md)
        self.assertLess(json_md.index('"a": 1'), json_md.index('"b": 2'))

        xml_md = extract._extract_xml(b"<root><item code='A'>Value</item></root>")
        self.assertIn("# root", xml_md)
        self.assertIn("`root / item`: Value", xml_md)
        self.assertIn("`root / item / @code`: A", xml_md)

    def test_docx_preserves_heading_paragraph_and_table(self) -> None:
        document_xml = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Official Guide</w:t></w:r></w:p>
            <w:p><w:r><w:t>Maintenance information.</w:t></w:r></w:p>
            <w:tbl>
              <w:tr><w:tc><w:p><w:r><w:t>Field</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
              <w:tr><w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc></w:tr>
            </w:tbl>
          </w:body>
        </w:document>'''
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", document_xml)
        markdown = extract._extract_docx(buffer.getvalue())
        self.assertIn("# Official Guide", markdown)
        self.assertIn("Maintenance information.", markdown)
        self.assertIn("| Field | Value |", markdown)
        self.assertIn("| Status | Active |", markdown)

    def test_xlsx_extracts_shared_strings_and_sheet(self) -> None:
        workbook = b'''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Fees" sheetId="1" r:id="rId1"/></sheets></workbook>'''
        rels = b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>'''
        shared = b'''<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Item</t></si><si><t>Fee</t></si><si><t>Renewal</t></si></sst>'''
        sheet = b'''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>350</v></c></row></sheetData></worksheet>'''
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/workbook.xml", workbook)
            archive.writestr("xl/_rels/workbook.xml.rels", rels)
            archive.writestr("xl/sharedStrings.xml", shared)
            archive.writestr("xl/worksheets/sheet1.xml", sheet)
        markdown = extract._extract_xlsx(buffer.getvalue())
        self.assertIn("# Fees", markdown)
        self.assertIn("| Item | Fee |", markdown)
        self.assertIn("| Renewal | 350 |", markdown)

    def test_email_extracts_headers_and_plain_body(self) -> None:
        message = (
            b"Subject: Filing notice\r\n"
            b"From: office@example.test\r\n"
            b"To: agent@example.test\r\n"
            b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
            b"Official notice body.\r\n"
        )
        markdown = extract._extract_email(message)
        self.assertIn("**Subject:** Filing notice", markdown)
        self.assertIn("Official notice body.", markdown)

    def test_ocr_image_uses_fixed_engine_without_shell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "input.png"
            image.write_bytes(b"fake image bytes")
            engine = root / "fake-tesseract"
            engine.write_text("#!/usr/bin/env python3\nprint('Recognized official notice')\n", encoding="utf-8")
            engine.chmod(engine.stat().st_mode | stat.S_IXUSR)
            previous = os.environ.get("MARKORBIT_TESSERACT_EXECUTABLE")
            os.environ["MARKORBIT_TESSERACT_EXECUTABLE"] = str(engine)
            try:
                text = extract._ocr_image(image, ["en"], 10)
            finally:
                if previous is None:
                    os.environ.pop("MARKORBIT_TESSERACT_EXECUTABLE", None)
                else:
                    os.environ["MARKORBIT_TESSERACT_EXECUTABLE"] = previous
            self.assertEqual(text, "Recognized official notice")

    def test_rich_inputs_fail_closed_on_complexity_and_archive_bombs(self) -> None:
        wide_csv = (",".join(f"c{index}" for index in range(extract.MAX_CSV_COLUMNS + 1)) + "\n").encode()
        with self.assertRaises(extract.ExtractionError) as csv_error:
            extract._extract_csv(wide_csv)
        self.assertEqual(csv_error.exception.code, "RICH_CSV_COLUMN_LIMIT_EXCEEDED")

        nested: object = "value"
        for _ in range(extract.MAX_JSON_DEPTH + 1):
            nested = [nested]
        with self.assertRaises(extract.ExtractionError) as json_error:
            extract._extract_json(json.dumps(nested).encode())
        self.assertEqual(json_error.exception.code, "RICH_JSON_DEPTH_LIMIT_EXCEEDED")

        xml = b'<!DOCTYPE root [<!ENTITY x "expanded">]><root>&x;</root>'
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
            pdf.write_bytes(b"%PDF-1.7\nsynthetic fixture")
            pdfinfo = root / "fake-pdfinfo"
            pdfinfo.write_text(
                "#!/usr/bin/env python3\nprint('Pages: 2')\nprint('Encrypted: no')\n",
                encoding="utf-8",
            )
            pdftotext = root / "fake-pdftotext"
            pdftotext.write_text(
                "#!/usr/bin/env python3\nprint('Official PDF text layer')\n",
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

    def test_main_writes_bounded_body_and_hash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "input.txt"
            output_path = root / "output.md"
            input_path.write_text("Source text", encoding="utf-8")
            request = {
                "protocolVersion": "1.0",
                "inputPath": str(input_path),
                "outputPath": str(output_path),
                "artifactKind": "TEXT",
                "mimeType": "text/plain",
                "mode": "RICH",
                "languages": ["en"],
                "maxOutputBytes": 1000,
                "maxPages": 10,
                "timeoutSeconds": 10,
            }
            old_stdin = sys.stdin
            old_stdout = sys.stdout
            try:
                sys.stdin = io.StringIO(json.dumps(request))
                captured = io.StringIO()
                sys.stdout = captured
                code = extract.main()
            finally:
                sys.stdin = old_stdin
                sys.stdout = old_stdout
            self.assertEqual(code, 0)
            response = json.loads(captured.getvalue())
            self.assertTrue(response["ok"])
            self.assertEqual(response["extractionMethod"], "TEXT_DECODER")
            output = output_path.read_bytes()
            self.assertEqual(response["sizeBytes"], len(output))
            self.assertEqual(response["sha256"], extract._sha256(output))
            self.assertEqual(output.decode("utf-8"), "Source text\n")


if __name__ == "__main__":
    unittest.main()
