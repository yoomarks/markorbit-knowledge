import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from workers.local_folder.local_folder_worker import (
    Checkpoint,
    CheckpointStore,
    DiscoveredFile,
    WorkerError,
    discover_files,
    process_checkpoint,
    roots_from_environment,
)


class FakeControlPlane:
    worker_id = "wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV"

    def __init__(self):
        self.execution_calls = []
        self.sessions = {}
        self.uploads = []
        self.finalizes = []

    def execution(self, lease_id, lease_token, operation, payload):
        self.execution_calls.append((lease_id, operation, payload))
        return {"replayed": False}

    def create_artifact_session(self, lease_id, lease_token, descriptor, key):
        session_id = f"ing_{len(self.sessions) + 1:026d}"
        existing = self.sessions.get(key)
        if existing:
            return {
                "record": {"session": {"id": existing, "status": "FINALIZED"}},
                "replayed": True,
            }
        self.sessions[key] = session_id
        return {"record": {"session": {"id": session_id, "status": "CREATED"}}, "replayed": False}

    def upload_artifact(self, lease_id, lease_token, session_id, content):
        self.uploads.append((session_id, content))
        return {"session": {"id": session_id, "status": "VERIFIED"}}

    def finalize_artifact(self, lease_id, lease_token, session_id):
        self.finalizes.append(session_id)
        return {"receipt": {"id": f"air_{session_id[-26:]}"}, "replayed": False}


def source(relative_path=".", recursive=True):
    return {
        "connectorConfig": {
            "rootBindingId": "primary",
            "relativePath": relative_path,
            "recursive": recursive,
        }
    }


def plan(max_items=100, includes=None, excludes=None):
    return {
        "policy": {
            "maxItems": max_items,
            "includePatterns": includes or [],
            "excludePatterns": excludes or [],
        },
        "output": {
            "artifactKinds": ["MARKDOWN", "TEXT", "PDF", "DOCX", "XLSX", "CSV", "JSON", "XML"]
        },
    }


class LocalFolderScannerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, relative, content=b"content"):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_discovers_only_supported_governed_files(self):
        self.write("a.md", b"# A")
        self.write("nested/b.pdf", b"%PDF")
        self.write("nested/skip.exe", b"x")
        self.write(".hidden.txt", b"hidden")
        items = discover_files({"primary": str(self.root)}, source(), plan())
        self.assertEqual([item.relative_path for item in items], ["a.md", "nested/b.pdf"])
        self.assertEqual(items[0].artifact_kind, "MARKDOWN")
        self.assertTrue(items[0].source_uri.startswith("local-folder://primary/"))
        self.assertNotIn(str(self.root), items[0].source_uri)

    def test_include_exclude_and_batch_cap_apply_to_relative_paths(self):
        self.write("include/a.md")
        self.write("include/b.md")
        self.write("include/private/c.md")
        self.write("other/d.md")
        items = discover_files(
            {"primary": str(self.root)},
            source(),
            plan(max_items=1, includes=["include/**"], excludes=["include/private/**"]),
        )
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0].relative_path.startswith("include/"))
        self.assertNotIn("private", items[0].relative_path)

    def test_rejects_absolute_and_parent_relative_source_paths(self):
        for relative in ["../escape", str(self.root.resolve())]:
            with self.subTest(relative=relative):
                with self.assertRaisesRegex(WorkerError, "LOCAL_FOLDER_PATH_REJECTED"):
                    discover_files({"primary": str(self.root)}, source(relative), plan())

    def test_rejects_unbound_root(self):
        with self.assertRaisesRegex(WorkerError, "LOCAL_FOLDER_ROOT_UNBOUND"):
            discover_files({}, source(), plan())

    def test_never_follows_symlink_files_or_directories(self):
        target = self.write("target.md")
        outside_dir = Path(self.temp.name).parent / f"outside-{os.getpid()}"
        outside_dir.mkdir(exist_ok=True)
        outside = outside_dir / "outside.md"
        outside.write_text("outside")
        try:
            file_link = self.root / "link.md"
            dir_link = self.root / "linked-dir"
            try:
                file_link.symlink_to(target)
                dir_link.symlink_to(outside_dir, target_is_directory=True)
            except OSError:
                self.skipTest("symlink creation unavailable on this platform")
            items = discover_files({"primary": str(self.root)}, source(), plan())
            paths = [item.relative_path for item in items]
            self.assertIn("target.md", paths)
            self.assertNotIn("link.md", paths)
            self.assertFalse(any("linked-dir" in item for item in paths))
        finally:
            outside.unlink(missing_ok=True)
            outside_dir.rmdir()

    def test_skips_files_over_bound(self):
        self.write("large.txt", b"12345")
        self.assertEqual(
            discover_files({"primary": str(self.root)}, source(), plan(), max_file_bytes=4), []
        )


class RestartReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.file = self.root / "brief.md"
        self.file.write_bytes(b"# brief")
        self.state = self.root / "state.json"

    def tearDown(self):
        self.temp.cleanup()

    def checkpoint(self):
        item = discover_files({"primary": str(self.root)}, source(), plan(max_items=1))[0]
        return Checkpoint(
            worker_id="wrk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            job={
                "id": "job_01ARZ3NDEKTSV4RRFFQ69G5FAV",
                "attempt": 1,
                "planSnapshot": plan(max_items=1),
            },
            lease={"id": "lse_01ARZ3NDEKTSV4RRFFQ69G5FAV"},
            lease_token="mls_test",
            files=[item.__dict__],
            receipt_ids=[],
        )

    def test_checkpoint_is_private_and_round_trips(self):
        store = CheckpointStore(self.state)
        value = self.checkpoint()
        store.save(value)
        loaded = store.load()
        self.assertEqual(loaded, value)
        if os.name != "nt":
            self.assertEqual(self.state.stat().st_mode & 0o777, 0o600)

    def test_restart_replays_same_session_identity_and_completes(self):
        client = FakeControlPlane()
        store = CheckpointStore(self.state)
        checkpoint = self.checkpoint()
        store.save(checkpoint)
        first_loaded = store.load()
        self.assertIsNotNone(first_loaded)

        # Simulate a crash after START/UPLOADING and immutable artifact finalization evidence.
        first_loaded.started = True
        first_loaded.uploading = True
        item = DiscoveredFile(**first_loaded.files[0])
        key_client = FakeControlPlane()
        # Run once to learn the deterministic session key and persist its simulated server identity.
        process_checkpoint(key_client, store, first_loaded)
        self.assertFalse(self.state.exists())

        # Recreate the checkpoint as if the final COMPLETE response had been lost. The protocol
        # must call the same artifact-session idempotency key and complete without a second upload.
        replay_checkpoint = self.checkpoint()
        replay_checkpoint.started = True
        replay_checkpoint.uploading = True
        session_key = next(iter(key_client.sessions))
        session_id = key_client.sessions[session_key]
        replay_checkpoint.receipt_ids = [f"air_{session_id[-26:]}"]
        store.save(replay_checkpoint)
        replay_client = FakeControlPlane()
        replay_client.sessions[session_key] = session_id
        process_checkpoint(replay_client, store, store.load())
        self.assertEqual(replay_client.uploads, [])
        self.assertFalse(self.state.exists())
        self.assertEqual(replay_client.execution_calls[-1][1], "complete")

    def test_restart_fails_closed_if_source_file_changed(self):
        store = CheckpointStore(self.state)
        checkpoint = self.checkpoint()
        store.save(checkpoint)
        self.file.write_bytes(b"changed")
        with self.assertRaisesRegex(WorkerError, "LOCAL_FOLDER_REPLAY_FILE_CHANGED"):
            process_checkpoint(FakeControlPlane(), store, store.load())


class EnvironmentTests(unittest.TestCase):
    def test_root_bindings_are_explicit_json(self):
        with patch.dict(os.environ, {"MARKORBIT_LOCAL_FOLDER_ROOTS_JSON": json.dumps({"a": "/tmp/a"})}):
            self.assertEqual(roots_from_environment(), {"a": "/tmp/a"})

    def test_empty_root_binding_map_is_rejected(self):
        with patch.dict(os.environ, {"MARKORBIT_LOCAL_FOLDER_ROOTS_JSON": "{}"}):
            with self.assertRaises(WorkerError):
                roots_from_environment()


if __name__ == "__main__":
    unittest.main()
