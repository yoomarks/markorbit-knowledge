# Local Integration Harness Foundation

TASK-023 adds a disposable integration-test package that assembles the real local control-plane components behind one lifecycle boundary.

## Components

The harness creates:

- a temporary SQLite database;
- the complete migration chain through `0013_staging_verification_pipeline`;
- ConversionRun ledger and claim persistence;
- authenticated runtime transitions;
- immutable Staging CAS;
- Staging verification;
- verifier-owned finalization;
- Conversion Pipeline Inspection Projection;
- local RawArtifact memory reader;
- local single-output uploader;
- the persistence-backed TASK-020 control-plane adapter.

## Ownership

The package lives under `packages/integration-tests`. Production packages do not depend on it. It may depend on contracts and persistence because it is an assembly and acceptance boundary, not a production runtime layer.

## Lifecycle

Each harness instance owns a temporary root by default. `close()` closes SQLite and removes the database and CAS tree. Callers may provide a root directory when they need to inspect artifacts after a test.

## Current acceptance

TASK-023 proves that the full migration chain and all real repositories can be assembled together, that the inspection projection is available, and that local fixture input/output boundaries enforce digest and single-use rules.

Complete successful and blocked pipeline scenarios are intentionally deferred to the next task, which will use this harness rather than recreating setup fixtures.

## Non-goals

No scheduler, polling, retry loop, HTTP API, production object store, Obsidian adapter, Ready Package, AI extraction, semantic analysis or MarkOrbit Core behavior is added.
