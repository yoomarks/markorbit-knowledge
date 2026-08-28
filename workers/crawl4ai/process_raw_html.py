from __future__ import annotations

import asyncio
import contextlib
import json
import sys
from pathlib import Path
from typing import Any

from acquire import PROTOCOL_VERSION, _content_for_kind, _error, _write_artifact
from safety import SafetyError, normalize_http_url

MAX_PAGES = 50
SUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"}


def _require_int(value: Any, name: str, minimum: int, maximum: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum or value > maximum:
        raise SafetyError("INVALID_REQUEST", f"{name} must be an integer between {minimum} and {maximum}")
    return value


def _parse_request(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("protocolVersion") != PROTOCOL_VERSION:
        raise SafetyError("INVALID_REQUEST", "Unsupported raw HTML processor request")
    output_directory = payload.get("outputDirectory")
    if not isinstance(output_directory, str) or not output_directory:
        raise SafetyError("INVALID_REQUEST", "outputDirectory is required")
    output_path = Path(output_directory).resolve()
    if not output_path.is_dir():
        raise SafetyError("INVALID_REQUEST", "outputDirectory must already exist")

    pages = payload.get("pages")
    if not isinstance(pages, list) or not pages or len(pages) > MAX_PAGES:
        raise SafetyError("INVALID_REQUEST", f"pages must contain between 1 and {MAX_PAGES} items")
    normalized_pages: list[dict[str, str]] = []
    for item in pages:
        if not isinstance(item, dict):
            raise SafetyError("INVALID_REQUEST", "Each raw HTML page must be an object")
        source_uri = item.get("sourceUri")
        html = item.get("html")
        if not isinstance(source_uri, str) or not isinstance(html, str) or not html:
            raise SafetyError("INVALID_REQUEST", "Each raw HTML page requires sourceUri and non-empty html")
        normalized_pages.append({"sourceUri": normalize_http_url(source_uri), "html": html})

    output_kinds = payload.get("outputKinds")
    if not isinstance(output_kinds, list) or not output_kinds:
        raise SafetyError("INVALID_REQUEST", "outputKinds must be a non-empty list")
    if any(kind not in SUPPORTED_OUTPUT_KINDS for kind in output_kinds):
        raise SafetyError("UNSUPPORTED_OUTPUT_KIND", "Raw HTML processing only supports HTML and MARKDOWN")

    return {
        "output_directory": output_path,
        "pages": normalized_pages,
        "output_kinds": list(dict.fromkeys(output_kinds)),
        "max_artifact_bytes": _require_int(payload.get("maxArtifactBytes"), "maxArtifactBytes", 1, 64 * 1024 * 1024),
        "max_total_bytes": _require_int(payload.get("maxTotalBytes"), "maxTotalBytes", 1, 256 * 1024 * 1024),
    }


async def _process(request: dict[str, Any]) -> dict[str, Any]:
    with contextlib.redirect_stdout(sys.stderr):
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

    browser_config = BrowserConfig(browser_type="chromium", headless=True, verbose=False)
    run_config = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, verbose=False)
    artifacts: list[dict[str, Any]] = []
    total_bytes = 0

    with contextlib.redirect_stdout(sys.stderr):
        async with AsyncWebCrawler(config=browser_config) as crawler:
            for page in request["pages"]:
                result = await crawler.arun(url=f"raw:{page['html']}", config=run_config)
                results = result if isinstance(result, list) else [result]
                successful = next((item for item in results if getattr(item, "success", False)), None)
                if successful is None:
                    raise SafetyError(
                        "CRAWL4AI_RAW_PROCESSING_FAILED",
                        "Crawl4AI could not process unlocked raw HTML",
                    )
                for kind in request["output_kinds"]:
                    content = _content_for_kind(successful, kind)
                    if not content:
                        continue
                    manifest, total_bytes = _write_artifact(
                        request["output_directory"],
                        len(artifacts) + 1,
                        page["sourceUri"],
                        kind,
                        content,
                        request["max_artifact_bytes"],
                        total_bytes,
                        request["max_total_bytes"],
                    )
                    manifest["sourceUri"] = page["sourceUri"]
                    manifest["canonicalUri"] = page["sourceUri"]
                    artifacts.append(manifest)

    if not artifacts:
        raise SafetyError("NO_ARTIFACTS_PRODUCED", "Raw HTML processing produced no artifacts")
    return {
        "protocolVersion": PROTOCOL_VERSION,
        "ok": True,
        "artifacts": artifacts,
        "pagesAttempted": len(request["pages"]),
        "totalBytes": total_bytes,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        request = _parse_request(payload)
        with contextlib.redirect_stdout(sys.stderr):
            response = asyncio.run(_process(request))
    except SafetyError as exc:
        response = _error(exc.code, exc.message, exc.retryable)
    except json.JSONDecodeError:
        response = _error("INVALID_REQUEST", "stdin must contain one JSON request")
    except Exception as exc:
        response = _error(
            "CRAWL4AI_RAW_RUNTIME_FAILED",
            f"Unexpected raw HTML processing failure: {type(exc).__name__}",
            retryable=False,
        )

    sys.stdout.write(json.dumps(response, separators=(",", ":"), ensure_ascii=True))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
