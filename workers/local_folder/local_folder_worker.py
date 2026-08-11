#!/usr/bin/env python3
"""MarkOrbit Knowledge LOCAL_FOLDER production Worker.

This worker never writes Knowledge persistence directly. It consumes the existing
Worker Protocol HTTP surface and turns explicitly bound local files into normal
ArtifactIngestionSession -> immutable RawArtifact evidence.
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import mimetypes
import os
import stat
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

RUNTIME_VERSION = "1.0.0"
EXECUTOR = {"executorId": "local-folder-worker", "version": RUNTIME_VERSION, "mode": "PRODUCTION"}
DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024
ABSOLUTE_MAX_ITEMS = 100
SUPPORTED = {
    ".md": ("MARKDOWN", "text/markdown"),
    ".txt": ("TEXT", "text/plain"),
    ".pdf": ("PDF", "application/pdf"),
    ".docx": ("DOCX", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".xlsx": ("XLSX", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".csv": ("CSV", "text/csv"),
    ".json": ("JSON", "application/json"),
    ".xml": ("XML", "application/xml"),
}


class WorkerError(RuntimeError):
    pass


class ProtocolError(WorkerError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class DiscoveredFile:
    relative_path: str
    path: str
    artifact_kind: str
    mime_type: str
    size_bytes: int
    sha256: str
    source_uri: str


@dataclass
class Checkpoint:
    worker_id: str
    job: dict[str, Any]
    lease: dict[str, Any]
    lease_token: str
    files: list[dict[str, Any]]
    receipt_ids: list[str]
    started: bool = False
    uploading: bool = False
    verifying: bool = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def stable_key(*parts: str) -> str:
    digest = hashlib.sha256("\x00".join(parts).encode("utf-8")).hexdigest()
    return f"local-folder:{digest}"


def _clean_relative(value: Any) -> Path:
    text = str(value or ".").strip().replace("\\", "/")
    candidate = Path(text)
    if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
        raise WorkerError("LOCAL_FOLDER_PATH_REJECTED: relativePath must stay inside its root binding")
    return candidate


def _inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def _assert_no_symlink_path(root: Path, relative: Path) -> None:
    current = root
    for part in relative.parts:
        current = current / part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError as exc:
            raise WorkerError(f"LOCAL_FOLDER_PATH_MISSING: {relative.as_posix()}") from exc
        if stat.S_ISLNK(mode):
            raise WorkerError(f"LOCAL_FOLDER_SYMLINK_REJECTED: {relative.as_posix()}")


def _matches(path: str, includes: Iterable[str], excludes: Iterable[str]) -> bool:
    include_list = [item for item in includes if item]
    exclude_list = [item for item in excludes if item]
    included = not include_list or any(fnmatch.fnmatch(path, pattern) for pattern in include_list)
    excluded = any(fnmatch.fnmatch(path, pattern) for pattern in exclude_list)
    return included and not excluded


def discover_files(
    root_bindings: dict[str, str],
    source: dict[str, Any],
    plan: dict[str, Any],
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES,
) -> list[DiscoveredFile]:
    config = source.get("connectorConfig") or {}
    if not isinstance(config, dict):
        raise WorkerError("LOCAL_FOLDER_CONFIG_INVALID: connectorConfig must be an object")
    binding_id = str(config.get("rootBindingId") or "").strip()
    if not binding_id or binding_id not in root_bindings:
        raise WorkerError("LOCAL_FOLDER_ROOT_UNBOUND: source rootBindingId is not bound on this worker")
    root = Path(root_bindings[binding_id]).expanduser().resolve(strict=True)
    if not root.is_dir() or root.is_symlink():
        raise WorkerError("LOCAL_FOLDER_ROOT_INVALID: bound root must be a real directory")
    relative_base = _clean_relative(config.get("relativePath"))
    _assert_no_symlink_path(root, relative_base)
    base = (root / relative_base).resolve(strict=True)
    if not _inside(root, base) or not base.is_dir() or base.is_symlink():
        raise WorkerError("LOCAL_FOLDER_PATH_REJECTED: selected folder escapes the root binding")

    policy = plan.get("policy") or {}
    output = plan.get("output") or {}
    if not isinstance(policy, dict) or not isinstance(output, dict):
        raise WorkerError("LOCAL_FOLDER_PLAN_INVALID: immutable plan snapshot is invalid")
    requested_kinds = set(output.get("artifactKinds") or [])
    includes = list(policy.get("includePatterns") or [])
    excludes = list(policy.get("excludePatterns") or [])
    plan_max = int(policy.get("maxItems") or ABSOLUTE_MAX_ITEMS)
    limit = max(1, min(plan_max, ABSOLUTE_MAX_ITEMS))
    recursive = config.get("recursive", True) is not False

    found: list[DiscoveredFile] = []
    for directory, directories, filenames in os.walk(base, followlinks=False):
        directory_path = Path(directory)
        safe_directories: list[str] = []
        for name in sorted(directories):
            child = directory_path / name
            if child.is_symlink() or name.startswith("."):
                continue
            safe_directories.append(name)
        directories[:] = safe_directories if recursive else []
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            file_path = directory_path / name
            if file_path.is_symlink() or not file_path.is_file():
                continue
            resolved = file_path.resolve(strict=True)
            if not _inside(root, resolved) or not _inside(base, resolved):
                raise WorkerError("LOCAL_FOLDER_PATH_REJECTED: discovered file escaped the bound root")
            relative = resolved.relative_to(root).as_posix()
            source_relative = resolved.relative_to(base).as_posix()
            if not _matches(source_relative, includes, excludes):
                continue
            metadata = SUPPORTED.get(resolved.suffix.lower())
            if not metadata:
                continue
            artifact_kind, mime_type = metadata
            if artifact_kind not in requested_kinds:
                continue
            size = resolved.stat().st_size
            if size <= 0 or size > max_file_bytes:
                continue
            digest, observed_size = sha256_file(resolved)
            if observed_size != size:
                raise WorkerError("LOCAL_FOLDER_FILE_CHANGED: file size changed during hashing")
            encoded = "/".join(urllib.parse.quote(part, safe="") for part in Path(relative).parts)
            found.append(
                DiscoveredFile(
                    relative_path=relative,
                    path=str(resolved),
                    artifact_kind=artifact_kind,
                    mime_type=mime_type,
                    size_bytes=size,
                    sha256=digest,
                    source_uri=f"local-folder://{urllib.parse.quote(binding_id, safe='')}/{encoded}",
                )
            )
            if len(found) >= limit:
                return found
    return found


def verify_checkpoint_files(files: list[dict[str, Any]]) -> list[DiscoveredFile]:
    verified: list[DiscoveredFile] = []
    for value in files:
        item = DiscoveredFile(**value)
        path = Path(item.path)
        if path.is_symlink() or not path.is_file():
            raise WorkerError(f"LOCAL_FOLDER_REPLAY_FILE_CHANGED: {item.relative_path}")
        digest, size = sha256_file(path)
        if digest != item.sha256 or size != item.size_bytes:
            raise WorkerError(f"LOCAL_FOLDER_REPLAY_FILE_CHANGED: {item.relative_path}")
        verified.append(item)
    return verified


class ControlPlaneClient:
    def __init__(self, base_url: str, worker_id: str, credential: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.worker_id = worker_id
        self.credential = credential
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: Any | None = None,
        content: bytes | None = None,
        lease_id: str | None = None,
        lease_token: str | None = None,
        worker_headers: bool = False,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.credential}"}
        if payload is not None:
            content = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if lease_token:
            headers["x-lease-token"] = lease_token
        if lease_id:
            headers["x-lease-id"] = lease_id
        if worker_headers:
            headers["x-worker-id"] = self.worker_id
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=content, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = response.read()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                envelope = json.loads(raw) if raw else {}
                error = envelope.get("error") or {}
                code = str(error.get("code") or f"HTTP_{exc.code}")
                message = str(error.get("message") or exc.reason)
            except json.JSONDecodeError:
                code, message = f"HTTP_{exc.code}", raw.decode("utf-8", "replace")
            raise ProtocolError(exc.code, code, message) from exc
        except urllib.error.URLError as exc:
            raise WorkerError(f"CONTROL_PLANE_UNAVAILABLE: {exc.reason}") from exc

    def heartbeat(self, active_lease_ids: list[str]) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/worker/v1/heartbeat",
            payload={
                "workerId": self.worker_id,
                "observedAt": utc_now(),
                "runtimeVersion": RUNTIME_VERSION,
                "health": "HEALTHY",
                "activeLeaseIds": active_lease_ids,
            },
        )

    def claim(self) -> dict[str, Any]:
        return self._request("POST", "/api/worker/v1/claim", payload={"workerId": self.worker_id})

    def execution(self, lease_id: str, lease_token: str, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/worker/v1/leases/{urllib.parse.quote(lease_id, safe='')}/{operation}",
            payload={"workerId": self.worker_id, **payload},
            lease_token=lease_token,
        )

    def create_artifact_session(
        self, lease_id: str, lease_token: str, descriptor: dict[str, Any], key: str
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/worker/v1/artifacts/sessions",
            payload={
                "workerId": self.worker_id,
                "leaseId": lease_id,
                "idempotencyKey": key,
                "descriptor": descriptor,
            },
            lease_token=lease_token,
        )

    def upload_artifact(self, lease_id: str, lease_token: str, session_id: str, content: bytes) -> dict[str, Any]:
        return self._request(
            "PUT",
            f"/api/worker/v1/artifacts/sessions/{urllib.parse.quote(session_id, safe='')}/content",
            content=content,
            lease_id=lease_id,
            lease_token=lease_token,
            worker_headers=True,
        )

    def finalize_artifact(self, lease_id: str, lease_token: str, session_id: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/worker/v1/artifacts/sessions/{urllib.parse.quote(session_id, safe='')}/finalize",
            content=b"",
            lease_id=lease_id,
            lease_token=lease_token,
            worker_headers=True,
        )


class CheckpointStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> Checkpoint | None:
        if not self.path.exists():
            return None
        value = json.loads(self.path.read_text(encoding="utf-8"))
        return Checkpoint(**value)

    def save(self, checkpoint: Checkpoint) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(asdict(checkpoint), indent=2, sort_keys=True), encoding="utf-8")
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.path)

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)


def _validate_claim(claim: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], str] | None:
    job, lease, token = claim.get("job"), claim.get("lease"), claim.get("leaseToken")
    if job is None and lease is None and token is None:
        return None
    if not isinstance(job, dict) or not isinstance(lease, dict) or not isinstance(token, str) or not token:
        raise WorkerError("WORKER_CLAIM_INVALID: control plane returned an incomplete claim")
    if job.get("jobType") != "LOCAL_FILE_SCAN":
        raise WorkerError("WORKER_JOB_TYPE_REJECTED: local-folder worker accepts LOCAL_FILE_SCAN only")
    connector = job.get("connector") or {}
    if connector.get("connectorId") != "local-folder" or connector.get("version") != RUNTIME_VERSION:
        raise WorkerError("WORKER_CONNECTOR_REJECTED: lease is not bound to local-folder@1.0.0")
    return job, lease, token


def _output_kinds(files: list[DiscoveredFile], job: dict[str, Any]) -> list[str]:
    if files:
        return sorted({item.artifact_kind for item in files})
    requested = ((job.get("planSnapshot") or {}).get("output") or {}).get("artifactKinds") or []
    if not requested:
        raise WorkerError("LOCAL_FOLDER_PLAN_INVALID: at least one output artifact kind is required")
    return [str(requested[0])]


def process_checkpoint(client: ControlPlaneClient, store: CheckpointStore, checkpoint: Checkpoint) -> None:
    job, lease, token = checkpoint.job, checkpoint.lease, checkpoint.lease_token
    lease_id = str(lease["id"])
    files = verify_checkpoint_files(checkpoint.files)
    if not checkpoint.started:
        client.execution(
            lease_id,
            token,
            "start",
            {"idempotencyKey": stable_key(str(job["id"]), "start"), "executor": EXECUTOR},
        )
        checkpoint.started = True
        store.save(checkpoint)
    if not checkpoint.uploading:
        client.execution(
            lease_id,
            token,
            "uploading",
            {"idempotencyKey": stable_key(str(job["id"]), "uploading")},
        )
        checkpoint.uploading = True
        store.save(checkpoint)

    receipt_ids = set(checkpoint.receipt_ids)
    for item in files:
        file_key = stable_key(str(job["id"]), str(job.get("attempt", 1)), item.relative_path, item.sha256)
        session = client.create_artifact_session(
            lease_id,
            token,
            {
                "artifactKind": item.artifact_kind,
                "mimeType": item.mime_type,
                "originalName": Path(item.relative_path).name,
                "expectedSizeBytes": item.size_bytes,
                "expectedSha256": item.sha256,
                "sourceUri": item.source_uri,
                "canonicalUri": item.source_uri,
            },
            file_key,
        )
        record = session.get("record") or {}
        session_value = record.get("session") or {}
        session_id = str(session_value.get("id") or "")
        status = str(session_value.get("status") or "")
        if not session_id:
            raise WorkerError("ARTIFACT_SESSION_INVALID: session ID missing")
        if status == "CREATED":
            client.upload_artifact(lease_id, token, session_id, Path(item.path).read_bytes())
        finalized = client.finalize_artifact(lease_id, token, session_id)
        receipt = finalized.get("receipt") or {}
        receipt_id = str(receipt.get("id") or "")
        if not receipt_id:
            raise WorkerError("ARTIFACT_FINALIZE_INVALID: receipt ID missing")
        if receipt_id not in receipt_ids:
            receipt_ids.add(receipt_id)
            checkpoint.receipt_ids.append(receipt_id)
            store.save(checkpoint)

    if not checkpoint.verifying:
        client.execution(
            lease_id,
            token,
            "verifying",
            {"idempotencyKey": stable_key(str(job["id"]), "verifying")},
        )
        checkpoint.verifying = True
        store.save(checkpoint)
    total_bytes = sum(item.size_bytes for item in files)
    receipt: dict[str, Any] = {
        "executor": EXECUTOR,
        "outputKinds": _output_kinds(files, job),
        "itemsObserved": len(files),
        "bytesPrepared": total_bytes,
        "metadataOnly": not files,
        "summary": f"LOCAL_FOLDER production scan finalized {len(files)} immutable RawArtifact item(s).",
    }
    if files:
        receipt["artifactReceiptIds"] = checkpoint.receipt_ids
    client.execution(
        lease_id,
        token,
        "complete",
        {"idempotencyKey": stable_key(str(job["id"]), "complete"), "receipt": receipt},
    )
    store.clear()


def run_once(
    client: ControlPlaneClient,
    roots: dict[str, str],
    store: CheckpointStore,
    max_file_bytes: int,
) -> bool:
    checkpoint = store.load()
    if checkpoint:
        client.heartbeat([str(checkpoint.lease["id"])])
        process_checkpoint(client, store, checkpoint)
        return True
    client.heartbeat([])
    claimed = _validate_claim(client.claim())
    if claimed is None:
        return False
    job, lease, token = claimed
    source = job.get("sourceSnapshot") or {}
    plan = job.get("planSnapshot") or {}
    files = discover_files(roots, source, plan, max_file_bytes=max_file_bytes)
    checkpoint = Checkpoint(
        worker_id=client.worker_id,
        job=job,
        lease=lease,
        lease_token=token,
        files=[asdict(item) for item in files],
        receipt_ids=[],
    )
    store.save(checkpoint)
    process_checkpoint(client, store, checkpoint)
    return True


def roots_from_environment() -> dict[str, str]:
    raw = os.environ.get("MARKORBIT_LOCAL_FOLDER_ROOTS_JSON", "")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise WorkerError("MARKORBIT_LOCAL_FOLDER_ROOTS_JSON must be valid JSON") from exc
    if not isinstance(value, dict) or not value:
        raise WorkerError("MARKORBIT_LOCAL_FOLDER_ROOTS_JSON must contain at least one root binding")
    result: dict[str, str] = {}
    for key, path in value.items():
        binding = str(key).strip()
        location = str(path).strip()
        if not binding or not location:
            raise WorkerError("Local-folder root bindings require non-empty IDs and paths")
        result[binding] = location
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="MarkOrbit Knowledge LOCAL_FOLDER production Worker")
    parser.add_argument("--once", action="store_true", help="process at most one lease and exit")
    parser.add_argument("--poll-seconds", type=float, default=5.0)
    args = parser.parse_args()
    base_url = os.environ.get("MARKORBIT_KNOWLEDGE_URL", "http://127.0.0.1:3000")
    worker_id = os.environ.get("MARKORBIT_WORKER_ID", "").strip()
    credential = os.environ.get("MARKORBIT_WORKER_CREDENTIAL", "").strip()
    if not worker_id or not credential:
        raise WorkerError("MARKORBIT_WORKER_ID and MARKORBIT_WORKER_CREDENTIAL are required")
    max_file_bytes = int(os.environ.get("MARKORBIT_LOCAL_FOLDER_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES))
    if max_file_bytes <= 0 or max_file_bytes > DEFAULT_MAX_FILE_BYTES:
        raise WorkerError(f"MARKORBIT_LOCAL_FOLDER_MAX_FILE_BYTES must be 1..{DEFAULT_MAX_FILE_BYTES}")
    state_path = Path(
        os.environ.get("MARKORBIT_LOCAL_FOLDER_STATE_PATH", ".data/local-folder-worker-state.json")
    )
    client = ControlPlaneClient(base_url, worker_id, credential)
    roots = roots_from_environment()
    store = CheckpointStore(state_path)
    while True:
        try:
            worked = run_once(client, roots, store, max_file_bytes)
        except ProtocolError as error:
            print(f"local-folder-worker protocol error: {error}", file=sys.stderr)
            return 2
        except WorkerError as error:
            print(f"local-folder-worker error: {error}", file=sys.stderr)
            return 2
        if args.once:
            return 0
        if not worked:
            time.sleep(max(1.0, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
