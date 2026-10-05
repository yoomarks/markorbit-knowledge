"""Governed UKIPO browser-download admission tests."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workers.local_folder import ukipo_journal as journal
from workers.local_folder import ukipo_journal_acquire as acquire
from workers.local_folder.tests.test_ukipo_journal import ISSUE, make_fixture


class UKIPOOfficialAcquisitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.download = self.root / "downloads" / f"{ISSUE}.zip"
        self.download.parent.mkdir()
        make_fixture(self.download)
        self.incoming = self.root / "F" / "raw" / "incoming" / "uk"
        self.archive = self.root / "F" / "raw" / "archive" / "uk"
        self.stage = (
            self.root / "E" / "structured-stage" / "gb" / "ukipo" / "journal-v1"
        )
        self.assets = self.root / "F" / "visual-raw" / "gb" / "mark-images"
        self.gov = self.root / "governed-plans" / "910"
        self.url = acquire.official_issue_url(ISSUE)

    def _plan(self) -> dict:
        with patch.object(acquire, "require_clean_repo", return_value="a" * 40):
            return acquire.make_plan(
                ISSUE,
                self.url,
                self.download,
                incoming_root=self.incoming,
                archive_root=self.archive,
                stage_root=self.stage,
                asset_root=self.assets,
            )

    def _apply(self, plan: dict, token: str | None = None) -> dict:
        plan_path = self.gov / f"ukipo-{ISSUE}-official-acquire-stage-plan-r1.json"
        acquire.write_json_exclusive(plan_path, plan)
        plan_sha = journal.sha256_file(plan_path)
        authority = token or (
            f"GO #910 GB-UKIPO-OFFICIAL-ACQUIRE-STAGE {plan_sha} ISSUE-{ISSUE}-TO-F-E"
        )
        with (
            patch.object(acquire, "GOV", self.gov),
            patch.object(journal, "RAW_ROOT", self.incoming),
            patch.object(journal, "ARCHIVE_ROOT", self.archive),
            patch.object(journal, "STAGE_ROOT", self.stage),
            patch.object(journal, "ASSET_ROOT", self.assets),
            patch.object(acquire, "current_git_head", return_value="a" * 40),
            patch.object(acquire, "require_clean_repo", return_value="a" * 40),
        ):
            acquire.authorize(plan, plan_sha, authority)
            return acquire.apply(plan, plan_sha)

    def test_only_canonical_official_issue_url_is_allowed(self) -> None:
        self.assertEqual(
            self.url,
            f"https://www.ipo.gov.uk/tm/t-journal/t-tmj/tm-journals/{ISSUE}/jnl.zip",
        )
        for invalid in (
            self.url.replace("https://", "http://"),
            self.url.replace("www.ipo.gov.uk", "example.com"),
            self.url + "?download=1",
            self.url.replace(ISSUE, "2026-034"),
        ):
            with self.assertRaisesRegex(
                journal.UKIPOInputError, "official UKIPO ZIP URL"
            ):
                acquire.validate_official_url(invalid, ISSUE)

    def test_freeze_is_read_only_and_binds_f_e_topology(self) -> None:
        plan = self._plan()
        self.assertEqual(plan["status"], "FROZEN_NO_APPLY")
        self.assertEqual(plan["source_scan"]["detail_count"], 2)
        self.assertEqual(
            plan["source_scan"]["zip_sha256"], journal.sha256_file(self.download)
        )
        self.assertTrue(plan["incoming_raw_path"].endswith(f"{ISSUE}.zip"))
        self.assertEqual(plan["raw_authority_drive"], "F")
        self.assertEqual(plan["structured_stage_drive"], "E")
        self.assertEqual(plan["structured_query_placement"], "hot_global")
        self.assertFalse(plan["data_engine_apply_authorized"])
        self.assertFalse(self.incoming.exists())
        self.assertFalse(self.stage.exists())
        self.assertTrue(self.download.is_file())

    def test_apply_requires_exact_token_and_is_resumable_without_source_delete(
        self,
    ) -> None:
        plan = self._plan()
        with self.assertRaisesRegex(journal.UKIPOInputError, "exact acquisition"):
            self._apply(plan, token="broad authorization")

        plan_path = self.gov / f"ukipo-{ISSUE}-official-acquire-stage-plan-r1.json"
        plan_path.unlink()
        receipt = self._apply(plan)
        self.assertEqual(
            receipt["status"],
            "OFFICIAL_RAW_ADMITTED_AND_STRUCTURED_STAGE_COMPLETE_NO_DB_APPLY",
        )
        incoming = self.incoming / f"{ISSUE}.zip"
        self.assertEqual(
            journal.sha256_file(incoming), journal.sha256_file(self.download)
        )
        self.assertTrue(self.download.is_file())
        self.assertFalse((self.archive / f"{ISSUE}.zip").exists())
        self.assertTrue(Path(receipt["stage_manifest_path"]).is_file())
        self.assertTrue(Path(receipt["stage_records_path"]).is_file())
        self.assertEqual(len(list(self.assets.rglob("*.jpg"))), 2)
        self.assertFalse(receipt["data_engine_applied"])
        self.assertFalse(receipt["raw_archived"])

        plan_path.unlink()
        replay = self._apply(plan)
        self.assertEqual(replay["plan_sha256"], receipt["plan_sha256"])
        self.assertTrue(replay["browser_download_retained"])

    def test_source_or_existing_raw_drift_fails_closed(self) -> None:
        plan = self._plan()
        self.download.write_bytes(b"changed")
        with self.assertRaisesRegex(journal.UKIPOInputError, "source ZIP changed"):
            self._apply(plan)

        plan_path = self.gov / f"ukipo-{ISSUE}-official-acquire-stage-plan-r1.json"
        plan_path.unlink()
        make_fixture(self.download)
        self.incoming.mkdir(parents=True)
        (self.incoming / f"{ISSUE}.zip").write_bytes(b"different")
        with self.assertRaisesRegex(journal.UKIPOInputError, "already exists"):
            self._plan()

    def test_plan_json_is_deterministic(self) -> None:
        first = self._plan()
        second = self._plan()
        self.assertEqual(
            acquire.canonical_json_sha(first), acquire.canonical_json_sha(second)
        )
        encoded = json.dumps(first, sort_keys=True)
        self.assertNotIn("current_registry_truth", encoded)


if __name__ == "__main__":
    unittest.main()
