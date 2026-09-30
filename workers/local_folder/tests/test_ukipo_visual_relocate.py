"""Tests for governed UKIPO original-logo relocation; synthetic files only."""

from __future__ import annotations

import hashlib
import tempfile
import unittest
from collections import namedtuple
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from workers.local_folder import ukipo_visual_relocate as relocate

DiskUsage = namedtuple("DiskUsage", "total used free")


def put_cas(root: Path, payload: bytes, suffix: str = ".jpg") -> tuple[Path, str]:
    digest = hashlib.sha256(payload).hexdigest()
    path = root / "sha256" / digest[:2] / digest[2:4] / f"{digest}{suffix}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path, digest


class UKIPOVisualRelocationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "e-source"
        self.target = self.root / "f-target"
        self.gov = self.root / "gov"
        self.gov.mkdir()
        self.audit = self.gov / "audit.json"
        self.audit.write_text('{"accepted":true}\n', encoding="utf-8")
        put_cas(self.source, b"first-logo")
        put_cas(self.source, b"second-logo")
        self.objects = relocate.checked_cas_objects(self.source, verify_content=True)
        self.facts = relocate.inventory(self.objects)
        self.disk_a = DiskUsage(total=10_000_000, used=1_000_000, free=9_000_000)
        self.disk_b = DiskUsage(total=10_000_000, used=2_000_000, free=8_000_000)

    def patches(self) -> ExitStack:
        stack = ExitStack()
        stack.enter_context(patch.object(relocate, "SOURCE_ROOT", self.source))
        stack.enter_context(patch.object(relocate, "TARGET_ROOT", self.target))
        stack.enter_context(patch.object(relocate, "FUTURE_ASSET_ROOT", self.target))
        stack.enter_context(patch.object(relocate, "GOV_ROOT", self.gov))
        stack.enter_context(patch.object(relocate, "ACCEPTED_AUDIT", self.audit))
        stack.enter_context(
            patch.object(
                relocate, "ACCEPTED_AUDIT_SHA", relocate.sha256_file(self.audit)
            )
        )
        stack.enter_context(
            patch.object(relocate, "EXPECTED_FILES", int(self.facts["file_count"]))
        )
        stack.enter_context(
            patch.object(relocate, "EXPECTED_BYTES", int(self.facts["bytes"]))
        )
        stack.enter_context(
            patch.object(
                relocate,
                "EXPECTED_SOURCE_INDEX_SHA",
                str(self.facts["path_size_index_sha256"]),
            )
        )
        stack.enter_context(
            patch.object(relocate, "RECEIPT", self.gov / "receipt.json")
        )
        stack.enter_context(patch.object(relocate, "reserve_floor", return_value=100))
        return stack

    def test_cas_inventory_verifies_filename_shard_and_content(self) -> None:
        facts = relocate.inventory(
            relocate.checked_cas_objects(self.source, verify_content=True)
        )
        self.assertEqual(facts, self.facts)
        path = self.objects[0].path
        path.write_bytes(b"tampered")
        with self.assertRaisesRegex(relocate.UKIPOVisualRelocationError, "content SHA"):
            relocate.checked_cas_objects(self.source, verify_content=True)

    def test_copy_is_additive_and_reuses_exact_existing_target(self) -> None:
        item = self.objects[0]
        copied = relocate.copy_object(item, self.target)
        self.assertTrue(copied)
        target = self.target / item.relative
        self.assertEqual(relocate.sha256_file(target), item.digest)
        reused = relocate.copy_object(item, self.target)
        self.assertFalse(reused)
        self.assertTrue(item.path.exists())

    def test_existing_target_mismatch_fails_without_overwrite(self) -> None:
        item = self.objects[0]
        target = self.target / item.relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"wrong")
        with self.assertRaisesRegex(relocate.UKIPOVisualRelocationError, "mismatch"):
            relocate.copy_object(item, self.target)
        self.assertEqual(target.read_bytes(), b"wrong")

    def test_plan_ignores_dynamic_free_bytes_but_pins_reserve_floor(self) -> None:
        with (
            self.patches(),
            patch.object(relocate.shutil, "disk_usage", return_value=self.disk_a),
        ):
            first = relocate.make_plan()
        with (
            self.patches(),
            patch.object(relocate.shutil, "disk_usage", return_value=self.disk_b),
        ):
            second = relocate.make_plan()
        self.assertEqual(first, second)
        self.assertNotIn("target_free_bytes_at_freeze", first)
        self.assertEqual(first["target_reserve_floor_bytes"], 100)
        self.assertFalse(first["source_delete_authorized"])
        self.assertFalse(first["serving_cutover_authorized"])

    def test_exact_authority_is_required(self) -> None:
        with (
            self.patches(),
            patch.object(relocate.shutil, "disk_usage", return_value=self.disk_a),
        ):
            plan = relocate.make_plan()
            plan_sha = "a" * 64
            token = (
                "GO #910 UKIPO-GB-VISUAL-F-RELOCATE "
                + plan_sha
                + " ADDITIVE-COPY-VERIFY-NO-DELETE"
            )
            relocate.validate_plan(plan, plan_sha, token)
            with self.assertRaisesRegex(
                relocate.UKIPOVisualRelocationError, "exact UKIPO F relocation"
            ):
                relocate.validate_plan(plan, plan_sha, token + " EXTRA")

    def test_apply_copies_all_objects_verifies_target_and_retains_source(self) -> None:
        with (
            self.patches(),
            patch.object(relocate.shutil, "disk_usage", return_value=self.disk_a),
        ):
            plan = relocate.make_plan()
            result = relocate.apply_relocation(plan, "b" * 64)
            self.assertEqual(
                result["status"], "F_ORIGINAL_VISUAL_RELOCATION_ACCEPTED_E_RETAINED"
            )
            self.assertEqual(result["target_file_count_verified"], 2)
            self.assertEqual(result["objects_copied_this_run"], 2)
            self.assertEqual(result["objects_reused_this_run"], 0)
            self.assertTrue(result["source_retained"])
            self.assertFalse(result["source_deleted"])
            self.assertTrue(self.source.exists())
            self.assertEqual(
                relocate.inventory(
                    relocate.checked_cas_objects(self.target, verify_content=True)
                ),
                self.facts,
            )

    def test_apply_resumes_matching_partial_target(self) -> None:
        first = self.objects[0]
        relocate.copy_object(first, self.target)
        with (
            self.patches(),
            patch.object(relocate.shutil, "disk_usage", return_value=self.disk_a),
        ):
            # A frozen plan is allowed to be applied after a matching partial copy
            # only if it was originally frozen before target creation. Synthesize
            # that immutable plan shape here.
            plan = {
                "kind": "UKIPO_GB_ORIGINAL_VISUAL_E_TO_F_RELOCATION_PLAN_V2",
                "status": "FROZEN_ADDITIVE_COPY_NO_DELETE",
                "source_root": str(self.source),
                "target_root": str(self.target),
                "source_file_count": self.facts["file_count"],
                "source_bytes": self.facts["bytes"],
                "source_path_size_index_sha256": self.facts["path_size_index_sha256"],
                "accepted_78_issue_audit_sha256": relocate.ACCEPTED_AUDIT_SHA,
                "relocation_operator_sha256": relocate.canonical_text_sha(
                    Path(relocate.__file__)
                ),
                "future_parser_asset_root": str(self.target),
                "target_drive": "F",
                "target_total_bytes": self.disk_a.total,
                "target_reserve_floor_bytes": 100,
                "copy_semantics": "ADDITIVE_CONTENT_ADDRESSED_RESUMABLE_COPY",
                "resume_existing_matching_objects": True,
                "verify_source_and_target_content_sha256": True,
                "source_retain_after_copy": True,
                "source_delete_authorized": False,
                "existing_target_mismatch_overwrite_authorized": False,
                "data_engine_ingest_authorized": False,
                "serving_cutover_authorized": False,
            }
            result = relocate.apply_relocation(plan, "c" * 64)
            self.assertEqual(result["objects_copied_this_run"], 1)
            self.assertEqual(result["objects_reused_this_run"], 1)
            self.assertEqual(result["target_file_count_verified"], 2)


if __name__ == "__main__":
    unittest.main()
