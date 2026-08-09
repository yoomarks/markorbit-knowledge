from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import os
import re
import sys
import time
from collections import deque
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from safety import (
    SafetyError,
    assert_public_dns,
    crawl_host_in_scope,
    host_of,
    normalize_http_url,
    redirect_host_in_scope,
    url_allowed_by_patterns,
)
from attachments import (
    AttachmentDownload,
    SUPPORTED_ATTACHMENT_KINDS,
    attachment_kind_for_url,
    download_attachment,
)

PROTOCOL_VERSION = "1.0"
SUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"} | set(SUPPORTED_ATTACHMENT_KINDS)


def _error(code: str, message: str, retryable: bool = False) -> dict[str, Any]:
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "ok": False,
        "error": {
            "code": code,
            "message": message[:1000],
            "retryable": bool(retryable),
        },
    }


def _require_int(value: Any, name: str, minimum: int, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        raise SafetyError("INVALID_REQUEST", f"{name} must be an integer between {minimum} and {maximum}")
    return value


def _require_bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise SafetyError("INVALID_REQUEST", f"{name} must be a boolean")
    return value


def _require_patterns(value: Any, name: str) -> list[str]:
    if not isinstance(value, list) or len(value) > 100:
        raise SafetyError("INVALID_REQUEST", f"{name} must be a list with at most 100 items")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item or len(item) > 500:
            raise SafetyError("INVALID_REQUEST", f"{name} contains an invalid pattern")
        result.append(item)
    return result


def _parse_request(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise SafetyError("INVALID_REQUEST", "Request must be a JSON object")
    if payload.get("protocolVersion") != PROTOCOL_VERSION:
        raise SafetyError("INVALID_REQUEST", "Unsupported Crawl4AI subprocess protocol version")

    output_directory = payload.get("outputDirectory")
    if not isinstance(output_directory, str) or not output_directory:
        raise SafetyError("INVALID_REQUEST", "outputDirectory is required")
    output_path = Path(output_directory).resolve()
    if not output_path.is_dir():
        raise SafetyError("INVALID_REQUEST", "outputDirectory must already exist")

    start_urls = payload.get("startUrls")
    if not isinstance(start_urls, list) or not start_urls or len(start_urls) > 50:
        raise SafetyError("INVALID_REQUEST", "startUrls must contain between 1 and 50 URLs")
    normalized_start_urls = [normalize_http_url(item) for item in start_urls]

    output_kinds = payload.get("outputKinds")
    if not isinstance(output_kinds, list) or not output_kinds:
        raise SafetyError("INVALID_REQUEST", "outputKinds must be a non-empty list")
    if any(kind not in SUPPORTED_OUTPUT_KINDS for kind in output_kinds):
        raise SafetyError("UNSUPPORTED_OUTPUT_KIND", "Crawl4AI collector only emits HTML and MARKDOWN")

    locale = payload.get("locale")
    if locale is not None and (not isinstance(locale, str) or len(locale) > 64):
        raise SafetyError("INVALID_REQUEST", "locale is invalid")

    return {
        "output_directory": output_path,
        "start_urls": normalized_start_urls,
        "output_kinds": list(dict.fromkeys(output_kinds)),
        "max_depth": _require_int(payload.get("maxDepth"), "maxDepth", 0, 5),
        "max_items": _require_int(payload.get("maxItems"), "maxItems", 1, 500),
        "render_javascript": _require_bool(payload.get("renderJavascript"), "renderJavascript"),
        "fetch_attachments": _require_bool(payload.get("fetchAttachments"), "fetchAttachments"),
        "respect_robots": _require_bool(payload.get("respectRobots"), "respectRobots"),
        "rate_limit_per_minute": _require_int(
            payload.get("rateLimitPerMinute"), "rateLimitPerMinute", 1, 600
        ),
        "timeout_seconds": _require_int(payload.get("timeoutSeconds"), "timeoutSeconds", 1, 300),
        "include_patterns": _require_patterns(payload.get("includePatterns"), "includePatterns"),
        "exclude_patterns": _require_patterns(payload.get("excludePatterns"), "excludePatterns"),
        "locale": locale,
        "max_artifact_bytes": _require_int(
            payload.get("maxArtifactBytes"), "maxArtifactBytes", 1, 64 * 1024 * 1024
        ),
        "max_total_bytes": _require_int(
            payload.get("maxTotalBytes"), "maxTotalBytes", 1, 256 * 1024 * 1024
        ),
        "require_egress_proxy": _require_bool(
            payload.get("requireEgressProxy"), "requireEgressProxy"
        ),
    }


def _proxy_configuration(require_proxy: bool) -> dict[str, str] | None:
    proxy = os.environ.get("MARKORBIT_CRAWL4AI_EGRESS_PROXY", "").strip()
    if require_proxy and not proxy:
        raise SafetyError(
            "EGRESS_PROXY_REQUIRED",
            "Production Crawl4AI execution requires MARKORBIT_CRAWL4AI_EGRESS_PROXY",
        )
    if not proxy:
        return None

    parsed = urlsplit(proxy)
    if parsed.scheme.lower() not in {"http", "https"} or parsed.hostname is None:
        raise SafetyError("INVALID_EGRESS_PROXY", "Configured egress proxy URL is invalid")
    return {"server": proxy}


class RateGate:
    def __init__(self, per_minute: int) -> None:
        self._interval = 60.0 / float(per_minute)
        self._last_started = 0.0

    async def wait(self) -> None:
        now = time.monotonic()
        delay = self._interval - (now - self._last_started)
        if delay > 0:
            await asyncio.sleep(delay)
        self._last_started = time.monotonic()


def _markdown_text(result: Any) -> str:
    value = getattr(result, "markdown", None)
    if value is None:
        return ""
    raw = getattr(value, "raw_markdown", None)
    if isinstance(raw, str):
        return raw
    if isinstance(value, str):
        return value
    return str(value)


def _safe_stem(url: str) -> str:
    parsed = urlsplit(url)
    name = Path(parsed.path).name or "index"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._") or "page"
    return stem[:80]


def _content_for_kind(result: Any, kind: str) -> bytes:
    if kind == "HTML":
        html = getattr(result, "html", None)
        return html.encode("utf-8") if isinstance(html, str) else b""
    if kind == "MARKDOWN":
        markdown = _markdown_text(result)
        return markdown.encode("utf-8") if markdown else b""
    return b""


def _extract_internal_links(result: Any) -> list[str]:
    links = getattr(result, "links", None)
    if not isinstance(links, dict):
        return []
    internal = links.get("internal")
    if not isinstance(internal, list):
        return []

    urls: list[str] = []
    for item in internal:
        if isinstance(item, str):
            urls.append(item)
        elif isinstance(item, dict):
            href = item.get("href")
            if isinstance(href, str):
                urls.append(href)
    return urls


def _write_artifact(
    output_directory: Path,
    sequence: int,
    url: str,
    kind: str,
    content: bytes,
    max_artifact_bytes: int,
    current_total_bytes: int,
    max_total_bytes: int,
) -> tuple[dict[str, Any], int]:
    if not content:
        raise SafetyError("EMPTY_ARTIFACT_NOT_ALLOWED", f"{kind} output is empty")
    if len(content) > max_artifact_bytes:
        raise SafetyError("ARTIFACT_TOO_LARGE", f"{kind} artifact exceeds the configured byte limit")
    if current_total_bytes + len(content) > max_total_bytes:
        raise SafetyError("COLLECTION_TOO_LARGE", "Collection exceeds the configured total byte limit")

    digest = hashlib.sha256(content).hexdigest()
    suffix = ".html" if kind == "HTML" else ".md"
    filename = f"{sequence:04d}-{_safe_stem(url)}-{digest[:12]}{suffix}"
    path = output_directory / filename
    with path.open("xb") as handle:
        handle.write(content)

    mime_type = "text/html" if kind == "HTML" else "text/markdown"
    return (
        {
            "artifactKind": kind,
            "mimeType": mime_type,
            "originalName": filename,
            "sourceUri": url,
            "canonicalUri": url,
            "fileName": filename,
            "sizeBytes": len(content),
            "sha256": digest,
        },
        current_total_bytes + len(content),
    )


def _write_attachment_artifact(
    output_directory: Path,
    sequence: int,
    attachment: AttachmentDownload,
    max_artifact_bytes: int,
    current_total_bytes: int,
    max_total_bytes: int,
) -> tuple[dict[str, Any], int]:
    content = attachment.content
    if not content:
        raise SafetyError("EMPTY_ARTIFACT_NOT_ALLOWED", "Attachment output is empty")
    if len(content) > max_artifact_bytes:
        raise SafetyError("ARTIFACT_TOO_LARGE", "Attachment exceeds the configured byte limit")
    if current_total_bytes + len(content) > max_total_bytes:
        raise SafetyError("COLLECTION_TOO_LARGE", "Collection exceeds the configured total byte limit")
    digest = hashlib.sha256(content).hexdigest()
    suffix = Path(attachment.original_name).suffix.lower()
    if not suffix or len(suffix) > 10 or not re.fullmatch(r"\.[a-z0-9]+", suffix):
        suffix = ".bin"
    filename = f"{sequence:04d}-{_safe_stem(attachment.final_url)}-{digest[:12]}{suffix}"
    path = output_directory / filename
    with path.open("xb") as handle:
        handle.write(content)
    return ({
        "artifactKind": attachment.artifact_kind,
        "mimeType": attachment.mime_type,
        "originalName": attachment.original_name,
        "sourceUri": attachment.source_url,
        "canonicalUri": attachment.final_url,
        "fileName": filename,
        "sizeBytes": len(content),
        "sha256": digest,
    }, current_total_bytes + len(content))


async def _crawl(request: dict[str, Any]) -> dict[str, Any]:
    proxy_config = _proxy_configuration(request["require_egress_proxy"])
    proxy_server = proxy_config["server"] if proxy_config else None

    with contextlib.redirect_stdout(sys.stderr):
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

    headers = {}
    if request["locale"]:
        headers["Accept-Language"] = request["locale"]

    browser_config = BrowserConfig(
        browser_type="chromium",
        headless=True,
        verbose=False,
        java_script_enabled=request["render_javascript"],
        text_mode=not request["render_javascript"],
        headers=headers or None,
        proxy_config=proxy_config,
    )
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        check_robots_txt=request["respect_robots"],
        page_timeout=request["timeout_seconds"] * 1000,
        exclude_external_links=True,
        exclude_social_media_links=True,
        verbose=False,
    )

    artifacts: list[dict[str, Any]] = []
    total_bytes = 0
    items_attempted = 0
    pages_attempted = 0
    attachments_attempted = 0
    attachment_hashes: set[str] = set()
    seen: set[str] = set()
    rate_gate = RateGate(request["rate_limit_per_minute"])
    last_error: SafetyError | None = None

    with contextlib.redirect_stdout(sys.stderr):
        async with AsyncWebCrawler(config=browser_config) as crawler:
            for seed_url in request["start_urls"]:
                if items_attempted >= request["max_items"]:
                    break
                seed_url = normalize_http_url(seed_url)
                seed_host = host_of(seed_url)
                await assert_public_dns(seed_url)
                queue: deque[tuple[str, int]] = deque([(seed_url, 0)])

                while queue and items_attempted < request["max_items"]:
                    raw_url, depth = queue.popleft()
                    try:
                        current_url = normalize_http_url(raw_url)
                    except SafetyError:
                        continue
                    if current_url in seen:
                        continue
                    if not crawl_host_in_scope(seed_host, host_of(current_url)):
                        continue
                    if depth > 0 and not url_allowed_by_patterns(
                        current_url, request["include_patterns"], request["exclude_patterns"]
                    ):
                        continue

                    attachment_kind = attachment_kind_for_url(current_url)
                    if attachment_kind is not None:
                        seen.add(current_url)
                        if not request["fetch_attachments"] or attachment_kind not in request["output_kinds"]:
                            continue
                        await assert_public_dns(current_url)
                        await rate_gate.wait()
                        items_attempted += 1
                        attachments_attempted += 1
                        try:
                            attachment = await download_attachment(
                                current_url,
                                seed_host=seed_host,
                                proxy_server=proxy_server,
                                locale=request["locale"],
                                timeout_seconds=request["timeout_seconds"],
                                max_bytes=min(request["max_artifact_bytes"], request["max_total_bytes"] - total_bytes),
                            )
                        except SafetyError as exc:
                            last_error = exc
                            continue
                        if attachment.artifact_kind not in request["output_kinds"]:
                            continue
                        digest = hashlib.sha256(attachment.content).hexdigest()
                        if digest in attachment_hashes:
                            continue
                        attachment_hashes.add(digest)
                        manifest, total_bytes = _write_attachment_artifact(
                            request["output_directory"], len(artifacts) + 1, attachment,
                            request["max_artifact_bytes"], total_bytes, request["max_total_bytes"],
                        )
                        artifacts.append(manifest)
                        continue

                    seen.add(current_url)
                    await assert_public_dns(current_url)
                    await rate_gate.wait()
                    items_attempted += 1
                    pages_attempted += 1

                    try:
                        result = await crawler.arun(url=current_url, config=run_config)
                    except Exception as exc:
                        last_error = SafetyError(
                            "CRAWL4AI_FETCH_FAILED",
                            f"Crawl4AI failed to fetch {current_url}: {type(exc).__name__}",
                            retryable=True,
                        )
                        continue

                    results = result if isinstance(result, list) else [result]
                    for page_result in results:
                        if not getattr(page_result, "success", False):
                            error_message = getattr(page_result, "error_message", None)
                            last_error = SafetyError(
                                "CRAWL4AI_FETCH_FAILED",
                                str(error_message or f"Crawl4AI reported failure for {current_url}"),
                                retryable=True,
                            )
                            continue

                        final_raw = getattr(page_result, "url", None)
                        final_url = normalize_http_url(
                            final_raw if isinstance(final_raw, str) else current_url
                        )
                        if not redirect_host_in_scope(seed_host, host_of(final_url)):
                            raise SafetyError(
                                "CROSS_DOMAIN_REDIRECT_BLOCKED",
                                "Crawl result redirected outside the authorized source host",
                            )
                        await assert_public_dns(final_url)

                        for kind in request["output_kinds"]:
                            content = _content_for_kind(page_result, kind)
                            if not content:
                                continue
                            manifest, total_bytes = _write_artifact(
                                request["output_directory"],
                                len(artifacts) + 1,
                                final_url,
                                kind,
                                content,
                                request["max_artifact_bytes"],
                                total_bytes,
                                request["max_total_bytes"],
                            )
                            manifest["sourceUri"] = current_url
                            manifest["canonicalUri"] = final_url
                            artifacts.append(manifest)

                        if depth < request["max_depth"]:
                            for href in _extract_internal_links(page_result):
                                try:
                                    candidate = normalize_http_url(href)
                                except SafetyError:
                                    continue
                                if not crawl_host_in_scope(seed_host, host_of(candidate)):
                                    continue
                                if not url_allowed_by_patterns(
                                    candidate,
                                    request["include_patterns"],
                                    request["exclude_patterns"],
                                ):
                                    continue
                                if candidate not in seen:
                                    queue.append((candidate, depth + 1))

    if not artifacts:
        if last_error is not None:
            raise last_error
        raise SafetyError("NO_ARTIFACTS_PRODUCED", "Crawl4AI completed without producing artifact bytes")

    return {
        "protocolVersion": PROTOCOL_VERSION,
        "ok": True,
        "artifacts": artifacts,
        "pagesAttempted": pages_attempted,
        "attachmentsAttempted": attachments_attempted,
        "totalBytes": total_bytes,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        request = _parse_request(payload)
        with contextlib.redirect_stdout(sys.stderr):
            response = asyncio.run(_crawl(request))
    except SafetyError as exc:
        response = _error(exc.code, exc.message, exc.retryable)
    except json.JSONDecodeError:
        response = _error("INVALID_REQUEST", "stdin must contain one JSON request")
    except Exception as exc:
        response = _error(
            "CRAWL4AI_RUNTIME_FAILED",
            f"Unexpected Crawl4AI runtime failure: {type(exc).__name__}",
            retryable=True,
        )

    sys.stdout.write(json.dumps(response, separators=(",", ":"), ensure_ascii=True))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
