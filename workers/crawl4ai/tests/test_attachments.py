from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import acquire
import attachments
from attachments import attachment_kind_for_url, download_attachment
from safety import SafetyError


class AttachmentTests(unittest.TestCase):
    def test_extension_classification(self):
        self.assertEqual(attachment_kind_for_url("https://example.com/a.pdf"), "PDF")
        self.assertEqual(attachment_kind_for_url("https://example.com/a.docx?x=1"), "DOCX")
        self.assertEqual(attachment_kind_for_url("https://example.com/a.png"), "IMAGE")
        self.assertIsNone(attachment_kind_for_url("https://example.com/a.html"))

    def test_html_masquerade_rejected(self):
        with self.assertRaises(SafetyError) as caught:
            attachments._kind_and_mime(
                "https://example.com/a.pdf",
                {"Content-Type": "text/html"},
            )
        self.assertEqual(caught.exception.code, "ATTACHMENT_MEDIA_TYPE_MISMATCH")

    def test_signatures(self):
        attachments._validate_signature("PDF", b"%PDF-1.7\n")
        attachments._validate_signature("DOCX", b"PK\x03\x04fixture")
        with self.assertRaises(SafetyError):
            attachments._validate_signature("PDF", b"no")

    def test_parent_lineage_updates_manifest_after_attachment_was_already_bound(self):
        attachment_url = "https://example.com/rules.pdf"
        parents: dict[str, set[str]] = {}
        manifests: dict[str, dict[str, object]] = {}
        manifest: dict[str, object] = {"artifactKind": "PDF"}

        acquire._record_attachment_parent(
            attachment_url,
            "https://example.com/page-a",
            parents,
            manifests,
        )
        acquire._bind_attachment_manifest(attachment_url, manifest, parents, manifests)
        self.assertEqual(manifest["parentCanonicalUris"], ["https://example.com/page-a"])

        acquire._record_attachment_parent(
            attachment_url,
            "https://example.com/page-b",
            parents,
            manifests,
        )
        self.assertEqual(
            manifest["parentCanonicalUris"],
            ["https://example.com/page-a", "https://example.com/page-b"],
        )

    def test_parent_lineage_merges_aliases_into_one_deduplicated_manifest(self):
        parents: dict[str, set[str]] = {}
        manifests: dict[str, dict[str, object]] = {}
        manifest: dict[str, object] = {"artifactKind": "PDF"}
        first = "https://example.com/download/rules.pdf"
        alias = "https://example.com/files/rules.pdf"

        acquire._record_attachment_parent(first, "https://example.com/z", parents, manifests)
        acquire._bind_attachment_manifest(first, manifest, parents, manifests)
        acquire._record_attachment_parent(alias, "https://example.com/a", parents, manifests)
        acquire._bind_attachment_manifest(alias, manifest, parents, manifests)
        acquire._record_attachment_parent(alias, "https://example.com/a", parents, manifests)

        self.assertEqual(
            manifest["parentCanonicalUris"],
            ["https://example.com/a", "https://example.com/z"],
        )


class AttachmentAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_download_scope_and_name(self):
        async def public_dns(_url):
            return ("93.184.216.34",)

        def sync(*_args, **_kwargs):
            return (
                "https://example.com/a.pdf",
                {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": 'attachment; filename="official.pdf"',
                },
                b"%PDF-1.7\nfixture",
            )

        with patch.object(attachments, "assert_public_dns", public_dns), patch.object(
            attachments,
            "_download_sync",
            sync,
        ):
            result = await download_attachment(
                "https://example.com/a.pdf",
                seed_host="example.com",
                proxy_server=None,
                locale=None,
                timeout_seconds=10,
                max_bytes=1024,
            )
        self.assertEqual(result.original_name, "official.pdf")

    async def test_cross_host_final_rejected(self):
        async def public_dns(_url):
            return ("93.184.216.34",)

        def sync(*_args, **_kwargs):
            return (
                "https://evil.example.net/a.pdf",
                {"Content-Type": "application/pdf"},
                b"%PDF-1.7\nfixture",
            )

        with patch.object(attachments, "assert_public_dns", public_dns), patch.object(
            attachments,
            "_download_sync",
            sync,
        ):
            with self.assertRaises(SafetyError) as caught:
                await download_attachment(
                    "https://example.com/a.pdf",
                    seed_host="example.com",
                    proxy_server=None,
                    locale=None,
                    timeout_seconds=10,
                    max_bytes=1024,
                )
        self.assertEqual(caught.exception.code, "CROSS_DOMAIN_REDIRECT_BLOCKED")
