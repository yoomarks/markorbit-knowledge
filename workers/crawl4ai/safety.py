from __future__ import annotations

import asyncio
import fnmatch
import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit, urlunsplit

_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_PORTS = {80, 443}
_BLOCKED_HOSTS = {"localhost", "localhost.localdomain"}
_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")


@dataclass(frozen=True)
class SafetyError(Exception):
    code: str
    message: str
    retryable: bool = False

    def __str__(self) -> str:
        return self.message


def _normalized_host(hostname: str) -> str:
    host = hostname.rstrip(".").lower()
    if not host:
        raise SafetyError("INVALID_URL", "URL hostname is required")
    try:
        return host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise SafetyError("INVALID_URL", "URL hostname is not valid IDNA") from exc


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def assert_public_ip(value: str) -> None:
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise SafetyError("DNS_RESOLUTION_INVALID", "Resolver returned an invalid IP address") from exc

    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped

    if not address.is_global:
        raise SafetyError(
            "PRIVATE_NETWORK_BLOCKED",
            f"Outbound target resolves to a non-public address: {address.compressed}",
        )


def normalize_http_url(raw: str) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise SafetyError("INVALID_URL", "URL must be a non-empty string")
    try:
        parsed = urlsplit(raw.strip())
    except ValueError as exc:
        raise SafetyError("INVALID_URL", "URL could not be parsed") from exc

    scheme = parsed.scheme.lower()
    if scheme not in _ALLOWED_SCHEMES:
        raise SafetyError("UNSUPPORTED_SCHEME", "Only http:// and https:// URLs are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise SafetyError("URL_CREDENTIALS_FORBIDDEN", "Credentials in target URLs are forbidden")
    if parsed.hostname is None:
        raise SafetyError("INVALID_URL", "URL hostname is required")

    host = _normalized_host(parsed.hostname)
    if host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_SUFFIXES):
        raise SafetyError("PRIVATE_NETWORK_BLOCKED", "Local or internal hostnames are forbidden")

    try:
        port = parsed.port
    except ValueError as exc:
        raise SafetyError("INVALID_PORT", "URL port is invalid") from exc
    effective_port = port or (443 if scheme == "https" else 80)
    if effective_port not in _ALLOWED_PORTS:
        raise SafetyError(
            "PORT_NOT_ALLOWED",
            "Only standard HTTP/HTTPS ports 80 and 443 are allowed",
        )

    if _is_ip_literal(host):
        assert_public_ip(host)

    host_for_netloc = f"[{host}]" if ":" in host else host
    netloc = host_for_netloc if port is None else f"{host_for_netloc}:{port}"
    path = parsed.path or "/"
    normalized = SplitResult(scheme, netloc, path, parsed.query, "")
    return urlunsplit(normalized)


def host_of(url: str) -> str:
    parsed = urlsplit(normalize_http_url(url))
    assert parsed.hostname is not None
    return _normalized_host(parsed.hostname)


def crawl_host_in_scope(seed_host: str, candidate_host: str) -> bool:
    return _normalized_host(seed_host) == _normalized_host(candidate_host)


def redirect_host_in_scope(seed_host: str, candidate_host: str) -> bool:
    left = _normalized_host(seed_host)
    right = _normalized_host(candidate_host)
    if left == right:
        return True
    return left == f"www.{right}" or right == f"www.{left}"


def url_allowed_by_patterns(url: str, include_patterns: list[str], exclude_patterns: list[str]) -> bool:
    if any(fnmatch.fnmatchcase(url, pattern) for pattern in exclude_patterns):
        return False
    if not include_patterns:
        return True
    return any(fnmatch.fnmatchcase(url, pattern) for pattern in include_patterns)


async def assert_public_dns(url: str) -> tuple[str, ...]:
    normalized = normalize_http_url(url)
    parsed = urlsplit(normalized)
    assert parsed.hostname is not None
    host = _normalized_host(parsed.hostname)
    if _is_ip_literal(host):
        assert_public_ip(host)
        return (host,)

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    loop = asyncio.get_running_loop()
    try:
        records = await asyncio.wait_for(
            loop.getaddrinfo(host, port, type=socket.SOCK_STREAM),
            timeout=5.0,
        )
    except asyncio.TimeoutError as exc:
        raise SafetyError("DNS_TIMEOUT", "DNS resolution timed out", retryable=True) from exc
    except socket.gaierror as exc:
        raise SafetyError("DNS_RESOLUTION_FAILED", "DNS resolution failed", retryable=True) from exc

    addresses = sorted({record[4][0] for record in records if record[4]})
    if not addresses:
        raise SafetyError("DNS_RESOLUTION_FAILED", "DNS resolution returned no addresses", retryable=True)
    for address in addresses:
        assert_public_ip(address)
    return tuple(addresses)
