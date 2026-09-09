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
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    async def arun_many(self, *, urls, config, dispatcher):
        self.calls.append(list(urls))
        return [
            SimpleNamespace(
                url=urls[0],
                redirected_url=None,
                success=True,
                error_message=None,
                html="<html>one</html>",
                markdown=SimpleNamespace(raw_markdown="   "),
                links={},
            ),
            SimpleNamespace(
                url=urls[1],
                redirected_url=None,
                success=True,
                error_message=None,
                html="<html>two</html>",
                markdown=SimpleNamespace(raw_markdown="# two"),
                links={},
            ),
        ]


class BatchConcurrencyTests(unittest.TestCase):
    def test_batches_pages_through_arun_many_and_skips_blank_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            request = {
                "output_directory": Path(directory),
                "start_urls": ["https://example.com/a", "https://example.com/b"],
                "output_kinds": ["HTML", "MARKDOWN"],
                "max_depth": 0,
                "max_items": 2,
                "fetch_attachments": False,
                "rate_limit_per_minute": 60,
                "timeout_seconds": 30,
                "include_patterns": [],
                "exclude_patterns": [],
                "locale": None,
                "max_artifact_bytes": 1024 * 1024,
                "max_total_bytes": 4 * 1024 * 1024,
            }
            crawler = FakeCrawler()

            async def public_dns(_url: str) -> None:
                return None

            with patch("acquire.assert_public_dns", public_dns):
                result = asyncio.run(
                    _crawl_concurrently(
                        request,
                        crawler,
                        object(),
                        None,
                        object(),
                        lambda _url: None,
                    )
                )

        self.assertEqual(crawler.calls, [["https://example.com/a", "https://example.com/b"]])
        self.assertEqual(result["pagesAttempted"], 2)
        self.assertEqual(result["attachmentsAttempted"], 0)
        self.assertEqual(len(result["artifacts"]), 3)
        self.assertEqual(
            [artifact["artifactKind"] for artifact in result["artifacts"]],
            ["HTML", "HTML", "MARKDOWN"],
        )


if __name__ == "__main__":
    unittest.main()