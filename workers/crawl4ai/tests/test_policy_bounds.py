from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from acquire import (
    MAX_DEPTH,
    MAX_ITEMS,
    MAX_LOCALE_LENGTH,
    MAX_PATTERN_LENGTH,
    MAX_PATTERNS_PER_LIST,
    MAX_RATE_LIMIT_PER_MINUTE,
    MAX_TIMEOUT_SECONDS,
    _parse_request,
)
from safety import SafetyError


class PolicyBoundsTests(unittest.TestCase):
    def payload(self, directory: str) -> dict[str, object]:
        return {
            "protocolVersion": "1.0",
            "outputDirectory": directory,
            "startUrls": ["https://example.com/trademarks"],
            "outputKinds": ["HTML"],
            "maxDepth": 1,
            "maxItems": 10,
            "renderJavascript": False,
            "fetchAttachments": False,
            "respectRobots": True,
            "rateLimitPerMinute": 30,
            "timeoutSeconds": 30,
            "includePatterns": [],
            "excludePatterns": [],
            "locale": "en-US",
            "maxArtifactBytes": 1024 * 1024,
            "maxTotalBytes": 4 * 1024 * 1024,
            "requireEgressProxy": False,
        }

    def assert_invalid(self, **updates: object) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = self.payload(directory)
            payload.update(updates)
            with self.assertRaises(SafetyError) as captured:
                _parse_request(payload)
        self.assertEqual(captured.exception.code, "INVALID_REQUEST")

    def test_accepts_exact_protocol_maxima(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = self.payload(directory)
            payload.update(
                {
                    "maxDepth": MAX_DEPTH,
                    "maxItems": MAX_ITEMS,
                    "rateLimitPerMinute": MAX_RATE_LIMIT_PER_MINUTE,
                    "timeoutSeconds": MAX_TIMEOUT_SECONDS,
                    "includePatterns": [f"/i/{i}" for i in range(MAX_PATTERNS_PER_LIST)],
                    "excludePatterns": ["/" + "x" * (MAX_PATTERN_LENGTH - 1)],
                }
            )
            parsed = _parse_request(payload)
        self.assertEqual(parsed["max_depth"], MAX_DEPTH)
        self.assertEqual(parsed["max_items"], MAX_ITEMS)

    def test_rejects_each_protocol_overflow(self) -> None:
        self.assert_invalid(maxDepth=MAX_DEPTH + 1)
        self.assert_invalid(maxItems=MAX_ITEMS + 1)
        self.assert_invalid(rateLimitPerMinute=MAX_RATE_LIMIT_PER_MINUTE + 1)
        self.assert_invalid(timeoutSeconds=MAX_TIMEOUT_SECONDS + 1)
        self.assert_invalid(includePatterns=[f"/i/{i}" for i in range(MAX_PATTERNS_PER_LIST + 1)])
        self.assert_invalid(excludePatterns=[f"/e/{i}" for i in range(MAX_PATTERNS_PER_LIST + 1)])
        self.assert_invalid(includePatterns=["/" + "a" * MAX_PATTERN_LENGTH])
        self.assert_invalid(locale="en-" + "US-" * 21 + "US")
        self.assertGreater(len("en-" + "US-" * 21 + "US"), MAX_LOCALE_LENGTH)


if __name__ == "__main__":
    unittest.main()
