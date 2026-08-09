from __future__ import annotations

import asyncio
import contextlib
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import unquote, urlsplit

from safety import (
    SafetyError,
    assert_public_dns,
    host_of,
    normalize_http_url,
    redirect_host_in_scope,
)

SUPPORTED_ATTACHMENT_KINDS = frozenset(
    {"PDF", "DOCX", "XLSX", "CSV", "JSON", "XML", "EMAIL", "IMAGE", "TEXT"}
)

_EXTENSION_KIND: dict[str, tuple[str, str]] = {
    ".pdf": ("PDF", "application/pdf"),
    ".docx": (
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    ".xlsx": (
        "XLSX",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    ".csv": ("CSV", "text/csv"),
    ".json": ("JSON", "application/json"),
    ".xml": ("XML", "application/xml"),
    ".txt": ("TEXT", "text/plain"),
    ".eml": ("EMAIL", "message/rfc822"),
    ".png": ("IMAGE", "image/png"),
    ".jpg": ("IMAGE", "image/jpeg"),
    ".jpeg": ("IMAGE", "image/jpeg"),
    ".tif": ("IMAGE", "image/tiff"),
    ".tiff": ("IMAGE", "image/tiff"),
    ".webp": ("IMAGE", "image/webp"),
}

_MIME_KIND: dict[str, tuple[str, str]] = {
    "application/pdf": ("PDF", "application/pdf"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
        "XLSX",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    "text/csv": ("CSV", "text/csv"),
    "application/csv": ("CSV", "text/csv"),
    "application/json": ("JSON", "application/json"),
    "text/json": ("JSON", "application/json"),
    "application/xml": ("XML", "application/xml"),
    "text/xml": ("XML", "application/xml"),
    "text/plain": ("TEXT", "text/plain"),
    "message/rfc822": ("EMAIL", "message/rfc822"),
    "image/png": ("IMAGE", "image/png"),
    "image/jpeg": ("IMAGE", "image/jpeg"),
    "image/tiff": ("IMAGE", "image/tiff"),
    "image/webp": ("IMAGE", "image/webp"),
}

_HTML_MIME_TYPES = {"text/html", "application/xhtml+xml"}
_GENERIC_MIME_TYPES = {"", "application/octet-stream", "binary/octet-stream"}


@dataclass(frozen=True)
class AttachmentDownload:
    artifact_kind: str
    mime_type: str
    original_name: str
    source_url: str
    final_url: str
    content: bytes


class _ScopedRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, seed_host: str) -> None:
        super().__init__()
        self._seed_host = seed_host

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        normalized = normalize_http_url(newurl)
        if not redirect_host_in_scope(self._seed_host, host_of(normalized)):
            raise SafetyError(
                "CROSS_DOMAIN_REDIRECT_BLOCKED",
                "Attachment redirect escaped the authorized source host",
            )
        return super().redirect_request(req, fp, code, msg, headers, normalized)


def _content_type(headers: Mapping[str, str]) -> str:
    raw = headers.get("Content-Type", headers.get("content-type", ""))
    return raw.split(";", 1)[0].strip().lower()


def _content_disposition_name(headers: Mapping[str, str]) -> str | None:
    raw = headers.get("Content-Disposition", headers.get("content-disposition", ""))
    if not raw:
        return None
    extended = re.search(r"filename\*\s*=\s*UTF-8''([^;]+)", raw, flags=re.IGNORECASE)
    if extended:
        return unquote(extended.group(1).strip().strip('"'))
    plain = re.search(r"filename\s*=\s*(?:\"([^\"]+)\"|([^;]+))", raw, flags=re.IGNORECASE)
    if not plain:
        return None
    return (plain.group(1) or plain.group(2) or "").strip().strip('"') or None


def _safe_original_name(value: str | None, url: str, kind: str) -> str:
    candidate = value or Path(unquote(urlsplit(url).path)).name
    candidate = candidate.replace("\\", "/").split("/")[-1]
    candidate = re.sub(r"[\x00-\x1f\x7f]+", "", candidate).strip()
    candidate = re.sub(r"[^A-Za-z0-9._() -]+", "-", candidate).strip(" .-")
    if candidate:
        return candidate[:240]
    default_suffix = {
        "PDF": ".pdf",
        "DOCX": ".docx",
        "XLSX": ".xlsx",
        "CSV": ".csv",
        "JSON": ".json",
        "XML": ".xml",
        "EMAIL": ".eml",
        "TEXT": ".txt",
        "IMAGE": ".bin",
    }.get(kind, ".bin")
    return f"attachment{default_suffix}"


def attachment_kind_for_url(url: str) -> str | None:
    try:
        path = Path(unquote(urlsplit(normalize_http_url(url)).path))
    except (SafetyError, ValueError):
        return None
    mapped = _EXTENSION_KIND.get(path.suffix.lower())
    return mapped[0] if mapped else None


def _kind_and_mime(url: str, headers: Mapping[str, str]) -> tuple[str, str] | None:
    content_type = _content_type(headers)
    if content_type in _HTML_MIME_TYPES:
        raise SafetyError(
            "ATTACHMENT_MEDIA_TYPE_MISMATCH",
            "Attachment URL returned HTML instead of a supported document payload",
            retryable=False,
        )
    by_mime = _MIME_KIND.get(content_type)
    if by_mime:
        return by_mime

    disposition_name = _content_disposition_name(headers)
    if disposition_name:
        by_name = _EXTENSION_KIND.get(Path(disposition_name).suffix.lower())
        if by_name:
            return by_name

    by_url = _EXTENSION_KIND.get(Path(unquote(urlsplit(url).path)).suffix.lower())
    if by_url and content_type in _GENERIC_MIME_TYPES:
        return by_url
    return None


def _validate_signature(kind: str, content: bytes) -> None:
    if not content:
        raise SafetyError("EMPTY_ARTIFACT_NOT_ALLOWED", "Attachment response body is empty")
    if kind == "PDF" and not content.startswith(b"%PDF-"):
        raise SafetyError(
            "ATTACHMENT_SIGNATURE_MISMATCH",
            "PDF attachment bytes do not contain a PDF header",
        )
    if kind in {"DOCX", "XLSX"} and not content.startswith(b"PK"):
        raise SafetyError(
            "ATTACHMENT_SIGNATURE_MISMATCH",
            f"{kind} attachment bytes are not an OOXML ZIP package",
        )


def _download_sync(
    url: str,
    seed_host: str,
    proxy_server: str | None,
    locale: str | None,
    timeout_seconds: int,
    max_bytes: int,
) -> tuple[str, Mapping[str, str], bytes]:
    handlers: list[urllib.request.BaseHandler] = [_ScopedRedirectHandler(seed_host)]
    if proxy_server:
        handlers.insert(0, urllib.request.ProxyHandler({"http": proxy_server, "https": proxy_server}))
    else:
        handlers.insert(0, urllib.request.ProxyHandler({}))
    opener = urllib.request.build_opener(*handlers)
    headers = {
        "User-Agent": "MarkOrbit-Knowledge/1.0 (+evidence-acquisition)",
        "Accept": "application/pdf,application/json,application/xml,text/*,image/*,application/octet-stream,*/*;q=0.1",
    }
    if locale:
        headers["Accept-Language"] = locale
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with contextlib.closing(opener.open(request, timeout=timeout_seconds)) as response:
            final_url = normalize_http_url(response.geturl())
            response_headers = {key: value for key, value in response.headers.items()}
            raw_length = response_headers.get("Content-Length")
            if raw_length:
                try:
                    declared_length = int(raw_length)
                except ValueError:
                    declared_length = -1
                if declared_length > max_bytes:
                    raise SafetyError(
                        "ARTIFACT_TOO_LARGE",
                        "Attachment Content-Length exceeds the configured artifact byte limit",
                    )
            content = response.read(max_bytes + 1)
    except SafetyError:
        raise
    except urllib.error.HTTPError as exc:
        retryable = exc.code >= 500 or exc.code in {408, 425, 429}
        raise SafetyError(
            "ATTACHMENT_FETCH_HTTP_ERROR",
            f"Attachment fetch returned HTTP {exc.code}",
            retryable=retryable,
        ) from exc
    except urllib.error.URLError as exc:
        raise SafetyError(
            "ATTACHMENT_FETCH_FAILED",
            f"Attachment fetch failed: {type(exc.reason).__name__}",
            retryable=True,
        ) from exc
    except TimeoutError as exc:
        raise SafetyError("ATTACHMENT_FETCH_TIMEOUT", "Attachment fetch timed out", retryable=True) from exc

    if len(content) > max_bytes:
        raise SafetyError("ARTIFACT_TOO_LARGE", "Attachment exceeds the configured artifact byte limit")
    return final_url, response_headers, content


async def download_attachment(
    url: str,
    *,
    seed_host: str,
    proxy_server: str | None,
    locale: str | None,
    timeout_seconds: int,
    max_bytes: int,
) -> AttachmentDownload:
    if max_bytes <= 0:
        raise SafetyError("COLLECTION_TOO_LARGE", "No remaining attachment byte budget")
    normalized = normalize_http_url(url)
    if not redirect_host_in_scope(seed_host, host_of(normalized)):
        raise SafetyError(
            "ATTACHMENT_HOST_OUT_OF_SCOPE",
            "Attachment URL is outside the authorized source host",
        )
    await assert_public_dns(normalized)
    final_url, headers, content = await asyncio.to_thread(
        _download_sync,
        normalized,
        seed_host,
        proxy_server,
        locale,
        timeout_seconds,
        max_bytes,
    )
    if not redirect_host_in_scope(seed_host, host_of(final_url)):
        raise SafetyError(
            "CROSS_DOMAIN_REDIRECT_BLOCKED",
            "Attachment redirect escaped the authorized source host",
        )
    await assert_public_dns(final_url)

    classification = _kind_and_mime(final_url, headers)
    if classification is None:
        raise SafetyError(
            "ATTACHMENT_MEDIA_TYPE_UNSUPPORTED",
            "Attachment response is not a supported document or image type",
        )
    kind, mime_type = classification
    _validate_signature(kind, content)
    return AttachmentDownload(
        artifact_kind=kind,
        mime_type=mime_type,
        original_name=_safe_original_name(_content_disposition_name(headers), final_url, kind),
        source_url=normalized,
        final_url=final_url,
        content=content,
    )
