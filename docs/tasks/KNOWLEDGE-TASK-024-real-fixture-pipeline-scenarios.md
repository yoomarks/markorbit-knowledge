# KNOWLEDGE-TASK-024 — Real Fixture Pipeline Success & Blocked Scenarios

Use the TASK-023 Local Integration Harness to run the controlled fixture pipeline against real SQLite repositories, authenticated runtime transitions, Staging CAS, verification, finalization and inspection projection.

Acceptance requires one deterministic PASS → READY → COMPLETED scenario and one deterministic FAIL → BLOCKED → FAILED scenario without repository mocks. Both scenarios assert the persisted Run, Attempt, Lease, Staging descriptor, verification evidence and inspection projection.

Deferred: scheduler, polling, retry, HTTP, Obsidian, Ready Package, AI extraction, semantic analysis and MarkOrbit Core behavior.
