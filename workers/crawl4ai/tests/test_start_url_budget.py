from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from acquire import MAX_START_URLS, _parse_request
from safety import SafetyError


class StartUrlBudgetTests(unittest.TestCase):
    def payload(self, output_directory: str, count: int) -> dict[str, object]:
        return {
            "protocolVersion": "1.0",
            "outputDirectory": output_directory,
            "startUrls": [f"https://example.com/trademarks/page-{index}" for index in range(count)],
            "outputKinds": ["HTML"],
            "maxDepth": 0,
            "maxItems": 1,
            "renderJavascript": False,
            "fetchAttachments": False,
            "respectRobots": True,
            "rateLimitPerMinute": 30,
            "timeoutSeconds": 30,
            "includePatterns": [],
            "excludePatterns": [],
            "maxArtifactBytes": 1024 * 1024,
            "maxTotalBytes": 4 * 1024 * 1024,
            "requireEgressProxy": False,
        }

    def test_accepts_more_than_legacy_fifty_start_urls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parsed = _parse_request(self.payload(directory, 51))
        self.assertEqual(len(parsed["start_urls"]), 51)

    def test_accepts_governed_maximum(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            parsed = _parse_request(self.payload(directory, MAX_START_URLS))
        self.assertEqual(len(parsed["start_urls"]), MAX_START_URLS)

    def test_rejects_above_governed_maximum(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SafetyError) as captured:
                _parse_request(self.payload(directory, MAX_START_URLS + 1))
        self.assertEqual(captured.exception.code, "INVALID_REQUEST")
        self.assertIn(str(MAX_START_URLS), str(captured.exception))


if __name__ == "__main__":
    unittest.main()
