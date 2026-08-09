from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlsplit

from attachments import attachment_kind_for_url
from safety import SafetyError, normalize_http_url


@dataclass(frozen=True)
class AttachmentCandidate:
    url: str
    source_page: str
    anchor_text: str | None
    discovered_by: str
    confidence: str
    extension_kind: str | None = None


_PATH_HINT = re.compile(
    r"(?:^|[-_/])(download|attachment|attachments|document|documents|file|files|export|media)(?:[-_/]|$)",
    flags=re.IGNORECASE,
)
_ANCHOR_HINT = re.compile(
    r"\b(pdf|docx?|xlsx?|csv|download|attachment|document|file|form|guide|manual|report)\b",
    flags=re.IGNORECASE,
)
_QUERY_HINT_KEYS = frozenset(
    {
        "attachment",
        "document",
        "doc",
        "download",
        "export",
        "file",
        "filename",
        "format",
        "media",
    }
)


def attachment_candidate_from_link(
    url: str,
    *,
    source_page: str,
    anchor_text: str | None = None,
) -> AttachmentCandidate | None:
    """Classify a link as an attachment candidate without making a network request.

    This is deliberately conservative. A candidate is only a routing hint; the
    downloader still validates host scope, response media type and file bytes.
    """

    try:
        normalized = normalize_http_url(url)
    except (SafetyError, ValueError):
        return None

    extension_kind = attachment_kind_for_url(normalized)
    if extension_kind is not None:
        return AttachmentCandidate(
            url=normalized,
            source_page=source_page,
            anchor_text=anchor_text,
            discovered_by="URL_EXTENSION",
            confidence="HIGH",
            extension_kind=extension_kind,
        )

    parsed = urlsplit(normalized)
    query_keys = {key.lower() for key, _ in parse_qsl(parsed.query, keep_blank_values=True)}
    clean_anchor = anchor_text.strip() if isinstance(anchor_text, str) and anchor_text.strip() else None

    if query_keys & _QUERY_HINT_KEYS:
        return AttachmentCandidate(
            url=normalized,
            source_page=source_page,
            anchor_text=clean_anchor,
            discovered_by="QUERY_HINT",
            confidence="MEDIUM",
        )

    if _PATH_HINT.search(parsed.path):
        return AttachmentCandidate(
            url=normalized,
            source_page=source_page,
            anchor_text=clean_anchor,
            discovered_by="PATH_HINT",
            confidence="MEDIUM",
        )

    if clean_anchor and _ANCHOR_HINT.search(clean_anchor):
        return AttachmentCandidate(
            url=normalized,
            source_page=source_page,
            anchor_text=clean_anchor,
            discovered_by="ANCHOR_HINT",
            confidence="LOW",
        )

    return None
