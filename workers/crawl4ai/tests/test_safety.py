from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from safety import (
    SafetyError,
    assert_public_ip,
    crawl_host_in_scope,
    normalize_http_url,
    redirect_host_in_scope,
    url_allowed_by_patterns,
)


class SafetyPolicyTests(unittest.TestCase):
    def test_normalizes_public_https_url_and_strips_fragment(self) -> None:
        self.assertEqual(
            normalize_http_url("HTTPS://Example.COM/path?q=1#fragment"),
            "https://example.com/path?q=1",
        )

    def test_blocks_non_http_credentials_local_hosts_and_nonstandard_ports(self) -> None:
        for url in (
            "file:///etc/passwd",
            "http://user:secret@example.com/",
            "http://localhost/",
            "http://example.local/",
            "http://example.com:22/",
            "http://127.0.0.1/",
            "http://169.254.169.254/latest/meta-data/",
        ):
            with self.subTest(url=url):
                with self.assertRaises(SafetyError):
                    normalize_http_url(url)

    def test_rejects_non_public_ip_ranges(self) -> None:
        for address in ("10.0.0.1", "192.168.1.2", "::1", "fc00::1", "100.64.0.1"):
            with self.subTest(address=address):
                with self.assertRaises(SafetyError):
                    assert_public_ip(address)

    def test_scope_is_exact_for_crawl_and_www_compatible_for_redirects(self) -> None:
        self.assertTrue(crawl_host_in_scope("example.com", "example.com"))
        self.assertFalse(crawl_host_in_scope("example.com", "docs.example.com"))
        self.assertTrue(redirect_host_in_scope("example.com", "www.example.com"))
        self.assertTrue(redirect_host_in_scope("www.example.com", "example.com"))
        self.assertFalse(redirect_host_in_scope("example.com", "example.net"))

    def test_include_and_exclude_patterns_are_bounded_filters(self) -> None:
        self.assertTrue(url_allowed_by_patterns("https://example.com/docs/a", ["*/docs/*"], []))
        self.assertFalse(url_allowed_by_patterns("https://example.com/news/a", ["*/docs/*"], []))
        self.assertFalse(
            url_allowed_by_patterns(
                "https://example.com/docs/private",
                ["*/docs/*"],
                ["*/private*"],
            )
        )


if __name__ == "__main__":
    unittest.main()
