"""Offline UKIPO journal parser and F: CAS staging tests (synthetic ZIP fixtures)."""
from __future__ import annotations

import hashlib
import html
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from workers.local_folder.ukipo_journal import (
    ASSET_ROOT,
    UKIPOInputError,
    approved_missing_images,
    parse_xhtml,
    scan_zip,
    sha256_file,
    stage_zip,
)

ISSUE = "2026-033"
UK = "UK00000000001"
WO = "WO00000000002"
JPEG_A = b"\xff\xd8\xff" + b"A" * 40
JPEG_B = b"\xff\xd8\xff" + b"B" * 41


def xhtml(body: str) -> bytes:
    return (
        '<html xmlns="http://www.w3.org/1999/xhtml"><body>'
        + body + "</body></html>"
    ).encode("utf-8")


def detail(mark: str, images: list[str]) -> bytes:
    labels = "".join(
        f'<img class="markimage" src="images/{html.escape(filename, quote=True)}" />'
        for filename in images
    )
    return xhtml(
        f'<h1 id="journalid">Trade Mark Journal No.2026/033 14 August 2026</h1>'
        '<div id="classdetails"><dl>'
        "<dt>Class 9</dt><dd>Games &amp; toys</dd>"
        "</dl></div>"
        "<p class=\"applicant\">A &Oacute;wner</p>"
        '<p class="representative">Representative: Agent</p>'
        f'<p class="marktext">{mark}</p>{labels}'
    )


def index_html(marks: list[str]) -> bytes:
    return xhtml(
        "Domestic Journal Number 2026/033 "
        + " ".join(f'<a href="{mark}.html">{mark}</a>' for mark in marks)
    )


def make_fixture(path: Path, *, issue: str = ISSUE, omit_image: bool = False,
                 wrong_title: bool = False, missing_owner: bool = False,
                 traversal: bool = False, unusual_image: bool = False,
                 case_mismatch: bool = False) -> None:
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as out:
        prefix = issue + "/"
        for name in ("word", "class", "owner", "agent", "image"):
            marks = [UK, WO]
            if name == "owner" and missing_owner:
                marks = [UK]
            if name == "word" and wrong_title:
                payload = xhtml("Domestic Journal Number 2026/035")
            else:
                payload = index_html(marks)
            out.writestr(prefix + name + ".html", payload)
        first = "logo-B&W-(1).jpg" if unusual_image else "first.jpg"
        out.writestr(prefix + UK + ".html", detail(UK, [first, "second.jpg"]))
        out.writestr(prefix + WO + ".html", detail(WO, ["another.jpg"]))
        out.writestr(prefix + "images/" + (first.upper() if case_mismatch else first), JPEG_A)
        out.writestr(prefix + "images/second.jpg", JPEG_B)
        if not omit_image:
            out.writestr(prefix + "images/another.jpg", JPEG_A)
        out.writestr(prefix + "images/tn-first.jpg", JPEG_B)
        out.writestr("header_logo.png", b"\x89PNG\r\n\x1a\nunused-logo")
        if traversal:
            out.writestr("../untrusted.css", "evil")


class UKIPOJournalPilotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.zip = self.root / f"{ISSUE}.zip"
        make_fixture(self.zip)

    def test_production_original_visual_root_is_f_drive(self) -> None:
        self.assertEqual(
            ASSET_ROOT,
            Path(r"F:\MarkOrbitData\visual-raw\assets\raw\gb\mark-images"),
        )

    def test_named_html_entities_and_exact_indexes(self) -> None:
        root = parse_xhtml(xhtml("<p>A &Oacute;wner &amp; another</p>"))
        self.assertEqual("".join(root.itertext()), "A Ówner & another")
        manifest, rows, assets = scan_zip(self.zip)
        self.assertEqual(manifest["detail_count"], 2)
        self.assertEqual((manifest["domestic_details"], manifest["madrid_details"]), (1, 1))
        self.assertEqual(manifest["mark_image_links"], 3)
        self.assertEqual(manifest["unique_original_images"], 2)
        self.assertEqual(manifest["index_coverage"]["owner"]["missing_detail_coverage"], 0)
        self.assertEqual(manifest["index_coverage"]["class"]["missing_detail_coverage"], 0)
        self.assertEqual(rows[0]["mark_id"], UK)
        self.assertEqual(rows[0]["goods_by_class"][0]["goods"], ["Games & toys"])
        self.assertEqual(rows[0]["applicants"], ["A Ówner"])
        self.assertEqual([i["ordinal"] for i in rows[0]["mark_images"]], [1, 2])
        self.assertEqual(len(assets), 2)

    def test_safe_unusual_real_world_media_name_and_malformed_alt(self) -> None:
        make_fixture(self.zip, unusual_image=True)
        report, records, _ = scan_zip(self.zip)
        self.assertEqual(report["unique_original_images"], 2)
        self.assertEqual(records[0]["mark_images"][0]["source_member"],
                         ISSUE + "/images/logo-B&W-(1).jpg")
        element = parse_xhtml(xhtml(
            '<img class="markimage" alt="contains <0.1G and </> " src="images/ok.jpg" />'
        ))
        self.assertEqual(element.find(".//{http://www.w3.org/1999/xhtml}img").get("alt"),
                         "contains <0.1G and </> ")
        mixed = parse_xhtml(xhtml(
            '<img alt="+" src="static.png" />'
            '<img class="markimage" alt="brand <2" Title="official" src="images/ok.jpg" />'
        ))
        image_nodes = list(mixed.iter("{http://www.w3.org/1999/xhtml}img"))
        self.assertEqual(len(image_nodes), 2)
        self.assertEqual(image_nodes[0].get("alt"), "+")
        self.assertEqual(image_nodes[1].get("Title"), "official")
        self.assertEqual(image_nodes[1].get("alt"), "brand <2")

    def test_unique_zip_image_casefold_alias_keeps_actual_source_name(self) -> None:
        make_fixture(self.zip, case_mismatch=True)
        report, records, _ = scan_zip(self.zip)
        self.assertEqual(report["image_casefold_alias_links"], 1)
        original = records[0]["mark_images"][0]
        self.assertEqual(original["declared_src"], "images/first.jpg")
        self.assertEqual(original["source_member"], ISSUE + "/images/FIRST.JPG")
        self.assertEqual(original["source_member_resolution"], "UNIQUE_CASEFOLD_ALIAS")

    def test_utf16_surrogate_numeric_pair_remains_meaningful(self) -> None:
        tree = parse_xhtml(xhtml("<p>o&#55357;&#56832;line</p>"))
        self.assertIn("o😀line", "".join(tree.itertext()))
        with self.assertRaisesRegex(UKIPOInputError, "XHTML parse failed"):
            parse_xhtml(xhtml("<p>dangling &#55357; surrogate</p>"))

    def test_staging_is_content_addressed_and_immutable(self) -> None:
        sha = sha256_file(self.zip)
        stage = self.root / "stage"
        images = self.root / "image-cas"
        receipt = stage_zip(self.zip, stage, images, sha)
        self.assertTrue(receipt["assets_staged"])
        self.assertFalse(receipt["data_engine_ingested"])
        self.assertFalse(receipt["canonical_raw_artifact_published"])
        records = [json.loads(line) for line in Path(receipt["records_path"]).read_text(
            encoding="utf-8"
        ).splitlines()]
        self.assertEqual(len(records), 2)
        self.assertEqual(
            records[0]["mark_images"][0]["sha256"],
            records[1]["mark_images"][0]["sha256"],
        )
        assets = list(images.rglob("*.jpg"))
        self.assertEqual(len(assets), 2)
        for image in assets:
            self.assertEqual(image.stem, hashlib.sha256(image.read_bytes()).hexdigest())
        self.assertEqual(receipt["records_sha256"], sha256_file(Path(receipt["records_path"])))
        with self.assertRaisesRegex(UKIPOInputError, "already exists"):
            stage_zip(self.zip, stage, images, sha)
        assets[0].write_bytes(b"corrupted")
        with self.assertRaisesRegex(UKIPOInputError, "existing CAS object mismatch"):
            stage_zip(self.zip, self.root / "new-stage", images, sha)

    def test_exact_missing_image_audit_quarantines_without_fake_logo(self) -> None:
        make_fixture(self.zip, omit_image=True)
        original_sha = sha256_file(self.zip)
        audit = {
            "kind": "UKIPO_MISSING_IMAGE_AUDIT_V1",
            "issues": [{
                "issue": ISSUE, "zip_sha256": original_sha,
                "missing_original_links": 1,
                "missing": [{
                    "mark": WO, "declared": ISSUE + "/images/another.jpg",
                    "casefold_candidates": [],
                }],
            }],
        }
        audit_path = self.root / "missing-audit.json"
        audit_path.write_text(json.dumps(audit), encoding="utf-8")
        audit_sha = sha256_file(audit_path)
        approved = approved_missing_images(audit_path, audit_sha, ISSUE, self.zip)
        self.assertEqual(approved, {(WO, ISSUE + "/images/another.jpg")})
        report, records, assets = scan_zip(self.zip, allow_missing_originals=True)
        self.assertFalse(report["image_evidence_complete"])
        self.assertEqual(report["missing_original_image_links"], 1)
        self.assertEqual(len(records), 2)
        self.assertFalse(records[1]["image_evidence_complete"])
        self.assertEqual(records[1]["mark_images"][0]["source_member_resolution"],
                         "MISSING_SOURCE_MEMBER")
        self.assertIsNone(records[1]["mark_images"][0]["sha256"])
        self.assertIsNone(records[1]["mark_images"][0]["asset_relative_path"])
        self.assertEqual(len(assets), 2)
        output = stage_zip(
            self.zip, self.root / "stage", self.root / "cas", original_sha,
            approved_missing=approved, approved_audit_sha=audit_sha,
        )
        self.assertTrue(output["assets_staged"])
        self.assertFalse(output["image_evidence_complete"])
        self.assertFalse(output["data_engine_ingested"])
        self.assertEqual(output["approved_missing_image_audit_sha256"], audit_sha)
        self.assertEqual(len(list((self.root / "cas").rglob("*.jpg"))), 2)
        with self.assertRaisesRegex(UKIPOInputError, "differs from accepted audit"):
            stage_zip(
                self.zip, self.root / "wrong-stage", self.root / "wrong-cas",
                original_sha, approved_missing={(WO, ISSUE + "/images/wrong.jpg")},
                approved_audit_sha=audit_sha,
            )
        self.assertFalse((self.root / "wrong-cas").exists())

    def test_missing_image_audit_is_bound_to_exact_zip_and_sha(self) -> None:
        make_fixture(self.zip, omit_image=True)
        audit_path = self.root / "missing-audit.json"
        audit_path.write_text(json.dumps({
            "kind": "UKIPO_MISSING_IMAGE_AUDIT_V1",
            "issues": [{
                "issue": ISSUE, "zip_sha256": sha256_file(self.zip),
                "missing_original_links": 1,
                "missing": [{"mark": WO, "declared": ISSUE + "/images/another.jpg"}],
            }],
        }), encoding="utf-8")
        with self.assertRaisesRegex(UKIPOInputError, "audit SHA changed"):
            approved_missing_images(audit_path, "a" * 64, ISSUE, self.zip)
        audit_sha = sha256_file(audit_path)
        make_fixture(self.zip)
        with self.assertRaisesRegex(UKIPOInputError, "does not bind exact ZIP"):
            approved_missing_images(audit_path, audit_sha, ISSUE, self.zip)

    def test_zip_issue_mismatch_fails_closed(self) -> None:
        make_fixture(self.zip, issue="2026-035", wrong_title=True)
        with self.assertRaisesRegex(UKIPOInputError, "untrusted ZIP member"):
            scan_zip(self.zip)
        make_fixture(self.zip, wrong_title=True)
        with self.assertRaisesRegex(UKIPOInputError, "filename disagrees"):
            scan_zip(self.zip)

    def test_untrusted_path_and_missing_original_fails_closed(self) -> None:
        make_fixture(self.zip, traversal=True)
        with self.assertRaisesRegex(UKIPOInputError, "untrusted ZIP member"):
            scan_zip(self.zip)
        make_fixture(self.zip, omit_image=True)
        with self.assertRaisesRegex(UKIPOInputError, "missing ZIP evidence"):
            scan_zip(self.zip)

    def test_missing_owner_index_and_sha_drift_fail_closed(self) -> None:
        make_fixture(self.zip, missing_owner=True)
        with self.assertRaisesRegex(UKIPOInputError, "does not cover"):
            scan_zip(self.zip)
        make_fixture(self.zip)
        with self.assertRaisesRegex(UKIPOInputError, "changed since reviewed preflight"):
            stage_zip(self.zip, self.root / "staging", self.root / "images", "f" * 64)


if __name__ == "__main__":
    unittest.main()
