import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workers.email.email_worker import (
    AccountBinding,
    Inflight,
    MessageEvidence,
    ReadOnlyMailbox,
    StateStore,
    WorkerError,
    WorkerState,
    account_bindings_from_environment,
    build_inflight,
    cursor_key,
    discover_new_messages,
    process_inflight,
    source_uri,
)


class FakeImap:
    messages = {10: b"Subject: A\r\n\r\nalpha", 11: b"Subject: B\r\n\r\nbeta"}
    uid_validity = 777
    instances = []

    def __init__(self, host, port, ssl_context=None):
        self.host = host
        self.port = port
        self.ssl_context = ssl_context
        self.calls = []
        self.__class__.instances.append(self)

    def login(self, username, password):
        self.calls.append(("LOGIN", username, password))
        return "OK", [b"logged in"]

    def select(self, mailbox, readonly=False):
        self.calls.append(("SELECT", mailbox, readonly))
        return "OK", [str(len(self.messages)).encode()]

    def response(self, name):
        self.calls.append(("RESPONSE", name))
        return name, [str(self.uid_validity).encode()]

    def uid(self, command, *args):
        self.calls.append(("UID", command, *args))
        if command == "SEARCH":
            criterion = str(args[-1])
            first = int(criterion.split()[1].split(":")[0])
            return "OK", [" ".join(str(uid) for uid in self.messages if uid >= first).encode()]
        if command == "FETCH":
            uid = int(args[0])
            return "OK", [(b"metadata", self.messages[uid])]
        raise AssertionError(f"unexpected IMAP command {command}")

    def close(self):
        self.calls.append(("CLOSE",))
        return "OK", []

    def logout(self):
        self.calls.append(("LOGOUT",))
        return "BYE", []


class FakeControlPlane:
    worker_id = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV"

    def __init__(self):
        self.execution_calls = []
        self.sessions = {}
        self.uploads = []

    def execution(self, lease_id, lease_token, operation, payload):
        self.execution_calls.append((operation, payload))
        return {"replayed": False}

    def create_artifact_session(self, lease_id, lease_token, descriptor, key):
        existing = self.sessions.get(key)
        if existing:
            return {
                "record": {
                    "session": {"id": existing[0], "status": "FINALIZED"},
                    "receipt": {"id": existing[1]},
                },
                "replayed": True,
            }
        session_id = f"ing_{len(self.sessions) + 1:026d}"
        receipt_id = f"air_{len(self.sessions) + 1:026d}"
        self.sessions[key] = (session_id, receipt_id)
        return {"record": {"session": {"id": session_id, "status": "CREATED"}}}

    def upload_artifact(self, lease_id, lease_token, session_id, content):
        self.uploads.append((session_id, content))
        return {"session": {"id": session_id, "status": "VERIFIED"}}

    def finalize_artifact(self, lease_id, lease_token, session_id):
        for stored_session, receipt in self.sessions.values():
            if stored_session == session_id:
                return {"receipt": {"id": receipt}}
        raise AssertionError("unknown session")


def job(initial_uid=10, max_items=2):
    return {
        "id": "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "attempt": 1,
        "sourceSnapshot": {
            "id": "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "connectorConfig": {
                "accountBindingId": "primary",
                "mailbox": "INBOX",
                "initialUid": initial_uid,
            },
        },
        "planSnapshot": {
            "policy": {"maxItems": max_items},
            "output": {"artifactKinds": ["EMAIL"]},
        },
    }


def binding():
    return AccountBinding("imap.example.test", 993, "user@example.test", "TEST_IMAP_PASSWORD")


class AccountBindingTests(unittest.TestCase):
    def test_password_is_indirected_through_worker_environment(self):
        value = {
            "primary": {
                "host": "imap.example.test",
                "port": 993,
                "username": "user@example.test",
                "passwordEnv": "TEST_IMAP_PASSWORD",
            }
        }
        with patch.dict(os.environ, {"MARKORBIT_EMAIL_ACCOUNTS_JSON": json.dumps(value)}):
            parsed = account_bindings_from_environment()
        self.assertEqual(parsed["primary"].password_env, "TEST_IMAP_PASSWORD")
        self.assertNotIn("password", as_json(parsed["primary"]))

    def test_inline_password_field_is_rejected(self):
        value = {
            "primary": {
                "host": "imap.example.test",
                "username": "user@example.test",
                "passwordEnv": "TEST_IMAP_PASSWORD",
                "password": "must-not-be-here",
            }
        }
        with patch.dict(os.environ, {"MARKORBIT_EMAIL_ACCOUNTS_JSON": json.dumps(value)}):
            with self.assertRaisesRegex(WorkerError, "unsupported fields"):
                account_bindings_from_environment()


def as_json(value):
    return json.dumps(value.__dict__, sort_keys=True)


class ReadOnlyImapTests(unittest.TestCase):
    def setUp(self):
        FakeImap.instances.clear()
        self.password = patch.dict(os.environ, {"TEST_IMAP_PASSWORD": "secret-value"})
        self.password.start()

    def tearDown(self):
        self.password.stop()

    def test_selects_readonly_and_fetches_with_body_peek_only(self):
        with ReadOnlyMailbox(binding(), "INBOX", FakeImap) as mailbox:
            self.assertEqual(mailbox.uid_validity, 777)
            self.assertEqual(mailbox.search_uids(10, 1), [10])
            self.assertEqual(mailbox.fetch(10), FakeImap.messages[10])
        calls = FakeImap.instances[-1].calls
        self.assertIn(("SELECT", "INBOX", True), calls)
        fetch = [call for call in calls if call[:2] == ("UID", "FETCH")][0]
        self.assertEqual(fetch[-1], "(UID BODY.PEEK[])")
        self.assertFalse(any(call[0] in {"STORE", "EXPUNGE"} for call in calls))

    def test_source_uri_exposes_binding_not_host_or_username(self):
        uri = source_uri("primary", "Legal Mail", 777, 10)
        self.assertEqual(uri, "imap-message://primary/Legal%20Mail/777/10")
        self.assertNotIn("imap.example.test", uri)
        self.assertNotIn("user@example.test", uri)


class CursorAndReplayTests(unittest.TestCase):
    def setUp(self):
        FakeImap.instances.clear()
        self.password = patch.dict(os.environ, {"TEST_IMAP_PASSWORD": "secret-value"})
        self.password.start()
        self.temp = tempfile.TemporaryDirectory()
        self.store = StateStore(Path(self.temp.name) / "email-state.json")

    def tearDown(self):
        self.temp.cleanup()
        self.password.stop()

    def test_discovery_uses_incremental_cursor_and_plan_cap(self):
        state = WorkerState()
        with ReadOnlyMailbox(binding(), "INBOX", FakeImap) as mailbox:
            values = discover_new_messages(mailbox, job(max_items=1), state, "primary", "INBOX", 10, 1024)
        self.assertEqual([uid for uid, _ in values], [10])
        key = cursor_key(job(), "primary", "INBOX")
        state.cursors[key] = {"uidValidity": 777, "lastUid": 10}
        with ReadOnlyMailbox(binding(), "INBOX", FakeImap) as mailbox:
            values = discover_new_messages(mailbox, job(), state, "primary", "INBOX", 10, 1024)
        self.assertEqual([uid for uid, _ in values], [11])

    def test_uidvalidity_change_fails_closed(self):
        state = WorkerState()
        key = cursor_key(job(), "primary", "INBOX")
        state.cursors[key] = {"uidValidity": 123, "lastUid": 10}
        with ReadOnlyMailbox(binding(), "INBOX", FakeImap) as mailbox:
            with self.assertRaisesRegex(WorkerError, "EMAIL_UIDVALIDITY_CHANGED"):
                discover_new_messages(mailbox, job(), state, "primary", "INBOX", 10, 1024)

    def test_oversized_message_fails_before_cursor_advances(self):
        state = WorkerState()
        with ReadOnlyMailbox(binding(), "INBOX", FakeImap) as mailbox:
            with self.assertRaisesRegex(WorkerError, "EMAIL_MESSAGE_TOO_LARGE"):
                discover_new_messages(mailbox, job(), state, "primary", "INBOX", 10, 2)
        self.assertEqual(state.cursors, {})

    def test_complete_advances_cursor_and_clears_private_inflight(self):
        values = [(10, FakeImap.messages[10]), (11, FakeImap.messages[11])]
        state = WorkerState(
            inflight=build_inflight(
                FakeControlPlane.worker_id,
                job(),
                {"id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV"},
                "mls_test",
                "primary",
                "INBOX",
                777,
                values,
            )
        )
        self.store.save(state)
        client = FakeControlPlane()
        process_inflight(client, {"primary": binding()}, self.store, state, FakeImap)
        persisted = self.store.load()
        self.assertIsNone(persisted.inflight)
        cursor = next(iter(persisted.cursors.values()))
        self.assertEqual(cursor, {"uidValidity": 777, "lastUid": 11})
        self.assertEqual(len(client.uploads), 2)
        self.assertEqual(client.execution_calls[-1][0], "complete")
        if os.name != "nt":
            self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)

    def test_restart_replays_finalized_sessions_without_duplicate_upload(self):
        values = [(10, FakeImap.messages[10])]
        state = WorkerState(
            inflight=build_inflight(
                FakeControlPlane.worker_id,
                job(max_items=1),
                {"id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV"},
                "mls_test",
                "primary",
                "INBOX",
                777,
                values,
            )
        )
        first = FakeControlPlane()
        self.store.save(state)
        process_inflight(first, {"primary": binding()}, self.store, state, FakeImap)
        session_map = dict(first.sessions)

        replay = WorkerState(
            inflight=build_inflight(
                FakeControlPlane.worker_id,
                job(max_items=1),
                {"id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV"},
                "mls_test",
                "primary",
                "INBOX",
                777,
                values,
            )
        )
        replay.inflight.started = True
        replay.inflight.uploading = True
        replay.inflight.receipt_ids = [next(iter(session_map.values()))[1]]
        self.store.save(replay)
        client = FakeControlPlane()
        client.sessions = session_map
        process_inflight(client, {"primary": binding()}, self.store, replay, FakeImap)
        self.assertEqual(client.uploads, [])
        self.assertIsNone(self.store.load().inflight)

    def test_restart_detects_same_uid_content_change(self):
        original = dict(FakeImap.messages)
        try:
            values = [(10, FakeImap.messages[10])]
            state = WorkerState(
                inflight=build_inflight(
                    FakeControlPlane.worker_id,
                    job(max_items=1),
                    {"id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV"},
                    "mls_test",
                    "primary",
                    "INBOX",
                    777,
                    values,
                )
            )
            self.store.save(state)
            FakeImap.messages[10] = b"changed"
            with self.assertRaisesRegex(WorkerError, "EMAIL_REPLAY_MESSAGE_CHANGED"):
                process_inflight(FakeControlPlane(), {"primary": binding()}, self.store, state, FakeImap)
            self.assertIsNotNone(self.store.load().inflight)
            self.assertEqual(self.store.load().cursors, {})
        finally:
            FakeImap.messages = original


if __name__ == "__main__":
    unittest.main()
