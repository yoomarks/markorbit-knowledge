from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import acquire


class RuntimeRedactionTests(unittest.TestCase):
    def test_runtime_failure_redacts_proxy_from_stderr_and_json(self) -> None:
        proxy = "http://user:super-secret@127.0.0.1:18080"

        async def fail(_request: dict[str, object]) -> dict[str, object]:
            raise RuntimeError(f"browser failed via {proxy}")

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            patch.dict(os.environ, {"MARKORBIT_CRAWL4AI_EGRESS_PROXY": proxy}, clear=False),
            patch.object(acquire.json, "load", return_value={}),
            patch.object(acquire, "_parse_request", return_value={}),
            patch.object(acquire, "_crawl", fail),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertEqual(acquire.main(), 0)

        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["error"]["code"], "CRAWL4AI_RUNTIME_FAILED")
        self.assertNotIn(proxy, stdout.getvalue())
        self.assertNotIn(proxy, stderr.getvalue())
        self.assertIn("[REDACTED_EGRESS_PROXY]", stdout.getvalue())
        self.assertIn("[REDACTED_EGRESS_PROXY]", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
