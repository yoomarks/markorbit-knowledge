#!/usr/bin/env python3
"""Read-only IMAP acquisition Worker for MarkOrbit Knowledge.

The Worker owns mailbox transport only. It never writes Knowledge persistence
and never mutates mailbox state. RFC822 bytes enter the existing controlled
Worker Protocol and immutable RawArtifact/CAS path.
"""

from __future__ import annotations

import argparse
import hashlib
import imaplib
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

RUNTIME_VERSION = "1.0.0"
EXECUTOR = {"executorId": "imap-email-worker", "version": RUNTIME_VERSION, "mode": "PRODUCTION"}
DEFAULT_MAX_MESSAGE_BYTES = 25 * 1024 * 1024
ABSOLUTE_MAX_MESSAGES = 50


class WorkerError(RuntimeError):
    pass


class ProtocolError(WorkerError):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AccountBinding:
    host: str
    port: int
    username: str
    password_env: str
    ca_file: str | None = None


@dataclass(frozen=True)
class MessageEvidence:
    uid: int
    sha256: str
    size_bytes: int
    source_uri: str


@dataclass
class Inflight:
    cursor_key: str
    worker_id: str
    job: dict[str, Any]
    lease: dict[str, Any]
    lease_token: str
    account_binding_id: str
    mailbox: str
    uid_validity: int
    messages: list[dict[str, Any]]
    receipt_ids: list[str] = field(default_factory=list)
    started: bool = False
    uploading: bool = False
    verifying: bool = False


@dataclass
class WorkerState:
    cursors: dict[str, dict[str, int]] = field(default_factory=dict)
    inflight: Inflight | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def stable_key(*parts: str) -> str:
    digest = hashlib.sha256("\x00".join(parts).encode("utf-8")).hexdigest()
    return f"imap-email:{digest}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def bounded_text(value: Any, field_name: str, maximum: int) -> str:
    text = str(value or "").strip()
    if not text or len(text) > maximum or "\x00" in text:
        raise WorkerError(f"EMAIL_CONFIG_INVALID: {field_name} is invalid")
    return text


def account_bindings_from_environment() -> dict[str, AccountBinding]:
    raw = os.environ.get("MARKORBIT_EMAIL_ACCOUNTS_JSON", "")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise WorkerError("MARKORBIT_EMAIL_ACCOUNTS_JSON must be valid JSON") from exc
    if not isinstance(value, dict) or not value:
        raise WorkerError("MARKORBIT_EMAIL_ACCOUNTS_JSON must contain at least one binding")
    result: dict[str, AccountBinding] = {}
    for binding_id, raw_binding in value.items():
        key = bounded_text(binding_id, "account binding ID", 120)
        if not isinstance(raw_binding, dict):
            raise WorkerError(f"EMAIL_ACCOUNT_BINDING_INVALID: {key}")
        unknown = set(raw_binding) - {"host", "port", "username", "passwordEnv", "caFile"}
        if unknown:
            raise WorkerError(f"EMAIL_ACCOUNT_BINDING_INVALID: unsupported fields for {key}")
        host = bounded_text(raw_binding.get("host"), f"{key}.host", 253)
        username = bounded_text(raw_binding.get("username"), f"{key}.username", 320)
        password_env = bounded_text(raw_binding.get("passwordEnv"), f"{key}.passwordEnv", 120)
        port = int(raw_binding.get("port", 993))
        if port < 1 or port > 65535:
            raise WorkerError(f"EMAIL_ACCOUNT_BINDING_INVALID: {key}.port")
        ca_file = raw_binding.get("caFile")
        result[key] = AccountBinding(
            host=host,
            port=port,
            username=username,
            password_env=password_env,
            ca_file=bounded_text(ca_file, f"{key}.caFile", 500) if ca_file is not None else None,
        )
    return result


class StateStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> WorkerState:
        if not self.path.exists():
            return WorkerState()
        value = json.loads(self.path.read_text(encoding="utf-8"))
        inflight_value = value.get("inflight")
        return WorkerState(
            cursors=value.get("cursors") or {},
            inflight=Inflight(**inflight_value) if inflight_value else None,
        )

    def save(self, state: WorkerState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        payload = {
            "cursors": state.cursors,
            "inflight": asdict(state.inflight) if state.inflight else None,
        }
        temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.path)


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

    def execution(
        self, lease_id: str, lease_token: str, operation: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
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

    def upload_artifact(
        self, lease_id: str, lease_token: str, session_id: str, content: bytes
    ) -> dict[str, Any]:
        return self._request(
            "PUT",
            f"/api/worker/v1/artifacts/sessions/{urllib.parse.quote(session_id, safe='')}/content",
            content=content,
            lease_id=lease_id,
            lease_token=lease_token,
            worker_headers=True,
        )

    def finalize_artifact(
        self, lease_id: str, lease_token: str, session_id: str
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/worker/v1/artifacts/sessions/{urllib.parse.quote(session_id, safe='')}/finalize",
            content=b"",
            lease_id=lease_id,
            lease_token=lease_token,
            worker_headers=True,
        )


class ReadOnlyMailbox:
    def __init__(
        self,
        binding: AccountBinding,
        mailbox: str,
        factory: Callable[..., imaplib.IMAP4_SSL] = imaplib.IMAP4_SSL,
    ):
        password = os.environ.get(binding.password_env)
        if not password:
            raise WorkerError(f"EMAIL_SECRET_MISSING: {binding.password_env}")
        context = ssl.create_default_context(cafile=binding.ca_file)
        self.client = factory(binding.host, binding.port, ssl_context=context)
        status, _ = self.client.login(binding.username, password)
        if status != "OK":
            raise WorkerError("EMAIL_AUTHENTICATION_FAILED")
        status, _ = self.client.select(mailbox, readonly=True)
        if status != "OK":
            raise WorkerError("EMAIL_MAILBOX_UNAVAILABLE")
        response = self.client.response("UIDVALIDITY")
        values = response[1] if response else None
        if not values or not values[0]:
            raise WorkerError("EMAIL_UIDVALIDITY_MISSING")
        self.uid_validity = int(values[0])

    def search_uids(self, first_uid: int, limit: int) -> list[int]:
        status, values = self.client.uid("SEARCH", None, f"UID {first_uid}:*")
        if status != "OK" or not values:
            raise WorkerError("EMAIL_UID_SEARCH_FAILED")
        raw = values[0] or b""
        uids = [int(item) for item in raw.split() if item]
        return sorted(uid for uid in uids if uid >= first_uid)[:limit]

    def fetch(self, uid: int) -> bytes:
        status, values = self.client.uid("FETCH", str(uid), "(UID BODY.PEEK[])")
        if status != "OK" or not values:
            raise WorkerError(f"EMAIL_FETCH_FAILED: UID {uid}")
        for item in values:
            if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
                return item[1]
        raise WorkerError(f"EMAIL_FETCH_FAILED: UID {uid}")

    def close(self) -> None:
        try:
            self.client.close()
        except imaplib.IMAP4.error:
            pass
        try:
            self.client.logout()
        except imaplib.IMAP4.error:
            pass

    def __enter__(self) -> "ReadOnlyMailbox":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


def validate_claim(claim: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], str] | None:
    job, lease, token = claim.get("job"), claim.get("lease"), claim.get("leaseToken")
    if job is None and lease is None and token is None:
        return None
    if not isinstance(job, dict) or not isinstance(lease, dict) or not isinstance(token, str) or not token:
        raise WorkerError("WORKER_CLAIM_INVALID")
    if job.get("jobType") != "EMAIL_IMPORT":
        raise WorkerError("WORKER_JOB_TYPE_REJECTED: email worker accepts EMAIL_IMPORT only")
    connector = job.get("connector") or {}
    if connector.get("connectorId") != "imap-email" or connector.get("version") != RUNTIME_VERSION:
        raise WorkerError("WORKER_CONNECTOR_REJECTED: lease is not bound to imap-email@1.0.0")
    return job, lease, token


def source_configuration(job: dict[str, Any]) -> tuple[str, str, int]:
    source = job.get("sourceSnapshot") or {}
    config = source.get("connectorConfig") or {}
    if not isinstance(config, dict):
        raise WorkerError("EMAIL_CONFIG_INVALID: connectorConfig must be an object")
    binding_id = bounded_text(config.get("accountBindingId"), "accountBindingId", 120)
    mailbox = bounded_text(config.get("mailbox"), "mailbox", 200)
    if "\r" in mailbox or "\n" in mailbox:
        raise WorkerError("EMAIL_CONFIG_INVALID: mailbox contains control characters")
    initial_uid = int(config.get("initialUid", 1))
    if initial_uid < 1:
        raise WorkerError("EMAIL_CONFIG_INVALID: initialUid must be positive")
    return binding_id, mailbox, initial_uid


def cursor_key(job: dict[str, Any], binding_id: str, mailbox: str) -> str:
    source = job.get("sourceSnapshot") or {}
    source_id = bounded_text(source.get("id"), "sourceSnapshot.id", 120)
    return hashlib.sha256(f"{source_id}\x00{binding_id}\x00{mailbox}".encode()).hexdigest()


def message_limit(job: dict[str, Any]) -> int:
    plan = job.get("planSnapshot") or {}
    policy = plan.get("policy") or {}
    output = plan.get("output") or {}
    if "EMAIL" not in (output.get("artifactKinds") or []):
        raise WorkerError("EMAIL_PLAN_INVALID: EMAIL output kind is required")
    value = int(policy.get("maxItems") or ABSOLUTE_MAX_MESSAGES)
    return max(1, min(value, ABSOLUTE_MAX_MESSAGES))


def source_uri(binding_id: str, mailbox: str, uid_validity: int, uid: int) -> str:
    return (
        f"imap-message://{urllib.parse.quote(binding_id, safe='')}/"
        f"{urllib.parse.quote(mailbox, safe='')}/{uid_validity}/{uid}"
    )


def build_inflight(
    worker_id: str,
    job: dict[str, Any],
    lease: dict[str, Any],
    lease_token: str,
    binding_id: str,
    mailbox_name: str,
    uid_validity: int,
    values: list[tuple[int, bytes]],
) -> Inflight:
    key = cursor_key(job, binding_id, mailbox_name)
    messages = [
        asdict(
            MessageEvidence(
                uid=uid,
                sha256=sha256_bytes(content),
                size_bytes=len(content),
                source_uri=source_uri(binding_id, mailbox_name, uid_validity, uid),
            )
        )
        for uid, content in values
    ]
    return Inflight(
        cursor_key=key,
        worker_id=worker_id,
        job=job,
        lease=lease,
        lease_token=lease_token,
        account_binding_id=binding_id,
        mailbox=mailbox_name,
        uid_validity=uid_validity,
        messages=messages,
    )


def discover_new_messages(
    mailbox: ReadOnlyMailbox,
    job: dict[str, Any],
    state: WorkerState,
    binding_id: str,
    mailbox_name: str,
    initial_uid: int,
    max_message_bytes: int,
) -> list[tuple[int, bytes]]:
    key = cursor_key(job, binding_id, mailbox_name)
    cursor = state.cursors.get(key)
    if cursor and int(cursor.get("uidValidity", -1)) != mailbox.uid_validity:
        raise WorkerError("EMAIL_UIDVALIDITY_CHANGED: operator review is required before cursor reset")
    first_uid = int(cursor.get("lastUid", initial_uid - 1)) + 1 if cursor else initial_uid
    uids = mailbox.search_uids(first_uid, message_limit(job))
    result: list[tuple[int, bytes]] = []
    for uid in uids:
        content = mailbox.fetch(uid)
        if not content:
            raise WorkerError(f"EMAIL_EMPTY_MESSAGE: UID {uid}")
        if len(content) > max_message_bytes:
            raise WorkerError(f"EMAIL_MESSAGE_TOO_LARGE: UID {uid}")
        result.append((uid, content))
    return result


def refetch_and_verify(mailbox: ReadOnlyMailbox, inflight: Inflight) -> list[tuple[MessageEvidence, bytes]]:
    if mailbox.uid_validity != inflight.uid_validity:
        raise WorkerError("EMAIL_UIDVALIDITY_CHANGED: inflight evidence cannot be replayed")
    verified: list[tuple[MessageEvidence, bytes]] = []
    for raw in inflight.messages:
        evidence = MessageEvidence(**raw)
        content = mailbox.fetch(evidence.uid)
        if len(content) != evidence.size_bytes or sha256_bytes(content) != evidence.sha256:
            raise WorkerError(f"EMAIL_REPLAY_MESSAGE_CHANGED: UID {evidence.uid}")
        verified.append((evidence, content))
    return verified


def artifact_receipt_from_session(
    client: ControlPlaneClient,
    lease_id: str,
    lease_token: str,
    job: dict[str, Any],
    evidence: MessageEvidence,
    content: bytes,
) -> str:
    key = stable_key(
        str(job["id"]),
        str(job.get("attempt", 1)),
        str(evidence.uid),
        evidence.sha256,
    )
    result = client.create_artifact_session(
        lease_id,
        lease_token,
        {
            "artifactKind": "EMAIL",
            "mimeType": "message/rfc822",
            "originalName": f"message-{evidence.uid}.eml",
            "expectedSizeBytes": evidence.size_bytes,
            "expectedSha256": evidence.sha256,
            "sourceUri": evidence.source_uri,
            "canonicalUri": evidence.source_uri,
        },
        key,
    )
    record = result.get("record") or {}
    session = record.get("session") or {}
    session_id = str(session.get("id") or "")
    status = str(session.get("status") or "")
    if not session_id:
        raise WorkerError("ARTIFACT_SESSION_INVALID")
    if status == "FINALIZED":
        receipt = record.get("receipt") or {}
        receipt_id = str(receipt.get("id") or "")
        if not receipt_id:
            raise WorkerError("ARTIFACT_SESSION_FINALIZED_WITHOUT_RECEIPT")
        return receipt_id
    if status == "CREATED":
        client.upload_artifact(lease_id, lease_token, session_id, content)
    elif status != "VERIFIED":
        raise WorkerError(f"ARTIFACT_SESSION_STATE_UNEXPECTED: {status}")
    finalized = client.finalize_artifact(lease_id, lease_token, session_id)
    receipt_id = str((finalized.get("receipt") or {}).get("id") or "")
    if not receipt_id:
        raise WorkerError("ARTIFACT_FINALIZE_INVALID")
    return receipt_id


def process_inflight(
    client: ControlPlaneClient,
    bindings: dict[str, AccountBinding],
    store: StateStore,
    state: WorkerState,
    mailbox_factory: Callable[..., imaplib.IMAP4_SSL] = imaplib.IMAP4_SSL,
) -> None:
    inflight = state.inflight
    if not inflight:
        return
    binding = bindings.get(inflight.account_binding_id)
    if not binding:
        raise WorkerError("EMAIL_ACCOUNT_UNBOUND: inflight account binding is unavailable")
    lease_id = str(inflight.lease["id"])
    with ReadOnlyMailbox(binding, inflight.mailbox, mailbox_factory) as mailbox:
        messages = refetch_and_verify(mailbox, inflight)
        if not inflight.started:
            client.execution(
                lease_id,
                inflight.lease_token,
                "start",
                {"idempotencyKey": stable_key(str(inflight.job["id"]), "start"), "executor": EXECUTOR},
            )
            inflight.started = True
            store.save(state)
        if not inflight.uploading:
            client.execution(
                lease_id,
                inflight.lease_token,
                "uploading",
                {"idempotencyKey": stable_key(str(inflight.job["id"]), "uploading")},
            )
            inflight.uploading = True
            store.save(state)
        known_receipts = set(inflight.receipt_ids)
        for evidence, content in messages:
            receipt_id = artifact_receipt_from_session(
                client, lease_id, inflight.lease_token, inflight.job, evidence, content
            )
            if receipt_id not in known_receipts:
                inflight.receipt_ids.append(receipt_id)
                known_receipts.add(receipt_id)
                store.save(state)
        if not inflight.verifying:
            client.execution(
                lease_id,
                inflight.lease_token,
                "verifying",
                {"idempotencyKey": stable_key(str(inflight.job["id"]), "verifying")},
            )
            inflight.verifying = True
            store.save(state)
        total_bytes = sum(evidence.size_bytes for evidence, _ in messages)
        receipt: dict[str, Any] = {
            "executor": EXECUTOR,
            "outputKinds": ["EMAIL"],
            "itemsObserved": len(messages),
            "bytesPrepared": total_bytes,
            "metadataOnly": not messages,
            "summary": f"Read-only IMAP import finalized {len(messages)} immutable RFC822 message(s).",
        }
        if messages:
            receipt["artifactReceiptIds"] = inflight.receipt_ids
        client.execution(
            lease_id,
            inflight.lease_token,
            "complete",
            {"idempotencyKey": stable_key(str(inflight.job["id"]), "complete"), "receipt": receipt},
        )
    last_uid = max((MessageEvidence(**item).uid for item in inflight.messages), default=None)
    prior = state.cursors.get(inflight.cursor_key)
    if last_uid is not None:
        state.cursors[inflight.cursor_key] = {
            "uidValidity": inflight.uid_validity,
            "lastUid": last_uid,
        }
    elif prior is None:
        state.cursors[inflight.cursor_key] = {
            "uidValidity": inflight.uid_validity,
            "lastUid": 0,
        }
    state.inflight = None
    store.save(state)


def run_once(
    client: ControlPlaneClient,
    bindings: dict[str, AccountBinding],
    store: StateStore,
    max_message_bytes: int,
    mailbox_factory: Callable[..., imaplib.IMAP4_SSL] = imaplib.IMAP4_SSL,
) -> bool:
    state = store.load()
    if state.inflight:
        client.heartbeat([str(state.inflight.lease["id"])])
        process_inflight(client, bindings, store, state, mailbox_factory)
        return True
    client.heartbeat([])
    claimed = validate_claim(client.claim())
    if claimed is None:
        return False
    job, lease, lease_token = claimed
    binding_id, mailbox_name, initial_uid = source_configuration(job)
    binding = bindings.get(binding_id)
    if not binding:
        raise WorkerError("EMAIL_ACCOUNT_UNBOUND: source accountBindingId is not configured on this worker")
    with ReadOnlyMailbox(binding, mailbox_name, mailbox_factory) as mailbox:
        values = discover_new_messages(
            mailbox,
            job,
            state,
            binding_id,
            mailbox_name,
            initial_uid,
            max_message_bytes,
        )
        state.inflight = build_inflight(
            client.worker_id,
            job,
            lease,
            lease_token,
            binding_id,
            mailbox_name,
            mailbox.uid_validity,
            values,
        )
        store.save(state)
    process_inflight(client, bindings, store, state, mailbox_factory)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="MarkOrbit Knowledge read-only IMAP Worker")
    parser.add_argument("--once", action="store_true", help="process at most one lease and exit")
    parser.add_argument("--poll-seconds", type=float, default=10.0)
    args = parser.parse_args()
    worker_id = os.environ.get("MARKORBIT_WORKER_ID", "").strip()
    credential = os.environ.get("MARKORBIT_WORKER_CREDENTIAL", "").strip()
    if not worker_id or not credential:
        raise WorkerError("MARKORBIT_WORKER_ID and MARKORBIT_WORKER_CREDENTIAL are required")
    maximum = int(os.environ.get("MARKORBIT_EMAIL_MAX_MESSAGE_BYTES", DEFAULT_MAX_MESSAGE_BYTES))
    if maximum < 1 or maximum > DEFAULT_MAX_MESSAGE_BYTES:
        raise WorkerError(f"MARKORBIT_EMAIL_MAX_MESSAGE_BYTES must be 1..{DEFAULT_MAX_MESSAGE_BYTES}")
    bindings = account_bindings_from_environment()
    state_path = Path(os.environ.get("MARKORBIT_EMAIL_STATE_PATH", ".data/email-worker-state.json"))
    store = StateStore(state_path)
    client = ControlPlaneClient(
        os.environ.get("MARKORBIT_KNOWLEDGE_URL", "http://127.0.0.1:3000"),
        worker_id,
        credential,
    )
    while True:
        try:
            worked = run_once(client, bindings, store, maximum)
        except (WorkerError, ProtocolError) as error:
            print(f"email-worker error: {error}", file=sys.stderr)
            return 2
        if args.once:
            return 0
        if not worked:
            time.sleep(max(1.0, args.poll_seconds))


if __name__ == "__main__":
    raise SystemExit(main())
