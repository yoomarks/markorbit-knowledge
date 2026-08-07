# KNOWLEDGE-TASK-025 — Local Manual Fixture Pipeline Runner v1

Add an explicitly invoked local command that accepts one bounded UTF-8 text file and an explicit evidence directory, executes the real controlled fixture pipeline, preserves SQLite/RawArtifact/CAS evidence and prints a redacted terminal JSON summary.

The runner executes once. It does not schedule, poll, retry automatically, expose an HTTP API or operate as a daemon.

Deferred: production transport and object storage, Obsidian, Ready Package, AI extraction, semantic analysis and MarkOrbit Core behavior.
