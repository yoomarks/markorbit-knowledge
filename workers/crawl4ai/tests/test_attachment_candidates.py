from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from attachment_candidates import attachment_candidate_from_link


class AttachmentCandidateTests(unittest.TestCase):
    def test_direct_extension_is_high_confidence(self) -> None:
        candidate = attachment_candidate_from_link(
            "https://example.com/forms/guide.pdf",
            source_page="https://example.com/forms",
            anchor_text="Guide",
        )
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.extension_kind, "PDF")
        self.assertEqual(candidate.discovered_by, "URL_EXTENSION")
        self.assertEqual(candidate.confidence, "HIGH")

    def test_query_only_download_is_candidate(self) -> None:
        candidate = attachment_candidate_from_link(
            "https://example.com/download?id=12345&format=pdf",
            source_page="https://example.com/forms",
            anchor_text="Official form",
        )
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.discovered_by, "QUERY_HINT")
        self.assertEqual(candidate.confidence, "MEDIUM")

    def test_download_path_without_extension_is_candidate(self) -> None:
        candidate = attachment_candidate_from_link(
            "https://example.com/documents/download/12345",
            source_page="https://example.com/forms",
        )
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.discovered_by, "PATH_HINT")

    def test_anchor_text_can_surface_low_confidence_candidate(self) -> None:
        candidate = attachment_candidate_from_link(
            "https://example.com/resource/12345",
            source_page="https://example.com/forms",
            anchor_text="Download PDF",
        )
        self.assertIsNotNone(candidate)
        assert candidate is not None
        self.assertEqual(candidate.discovered_by, "ANCHOR_HINT")
        self.assertEqual(candidate.confidence, "LOW")

    def test_normal_page_is_not_candidate(self) -> None:
        candidate = attachment_candidate_from_link(
            "https://example.com/trademarks/maintenance",
            source_page="https://example.com/trademarks",
            anchor_text="Maintenance information",
        )
        self.assertIsNone(candidate)


if __name__ == "__main__":
    unittest.main()
