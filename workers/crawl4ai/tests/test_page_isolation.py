from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from acquire import _crawl_concurrently


class FakeCrawler:
    async def arun_many(self, *, urls, config, dispatcher):
        return [
            SimpleNamespace(
                url=urls[0], redirected_url=None, success=True, error_message=None,
                html="<html>good</html>", markdown=SimpleNamespace(raw_markdown="# good"), links={},
            ),
            SimpleNamespace(
                url=urls[1], redirected_url="https://outside.example.org/escaped",
                success=True, error_message=None, html="<html>blocked</html>",
                markdown=SimpleNamespace(raw_markdown="# blocked"), links={},
            ),
            SimpleNamespace(
                url=urls[2], redirected_url=None, success=True, error_message=None,
                html="x" * 2048, markdown=SimpleNamespace(raw_markdown="# small"), links={},
            ),
        ]


class PageIsolationTests(unittest.TestCase):
    def test_bad_pages_do_not_escape_scope_or_abort_good_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            request = {
                "output_directory": Path(directory),
                "start_urls": [
                    "https://example.com/good",
                    "https://example.com/cross",
                    "https://example.com/large",
                ],
                "output_kinds": ["HTML", "MARKDOWN"],
                "max_depth": 0,
                "max_items": 3,
                "fetch_attachments": False,
                "rate_limit_per_minute": 60,
                "timeout_seconds": 30,
                "include_patterns": [],
                "exclude_patterns": [],
                "locale": None,
                "max_artifact_bytes": 1024,
                "max_total_bytes": 1024 * 1024,
            }

            async def public_dns(_url: str) -> None:
                return None

            with patch("acquire.assert_public_dns", public_dns):
                result = asyncio.run(
                    _crawl_concurrently(
                        request, FakeCrawler(), object(), None, object(), lambda _url: None,
                    )
                )

        self.assertEqual(result["pagesAttempted"], 3)
        self.assertEqual(
            [artifact["artifactKind"] for artifact in result["artifacts"]],
            ["HTML", "MARKDOWN", "MARKDOWN"],
        )
        self.assertTrue(all("outside.example.org" not in artifact["canonicalUri"] for artifact in result["artifacts"]))


if __name__ == "__main__":
    unittest.main()
