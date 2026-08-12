# MarkOrbit Knowledge v0.1.0 Release Closeout

Date: 2026-08-12  
Release version: `0.1.0`  
Repository: `yoomarks/markorbit-knowledge`

## Purpose

This document converts the v0.1 freeze decision into a repeatable release procedure. It does not expand product scope and it does not weaken any K01-K16 or K-EXT-A-E boundary.

The release is a repository/control-plane release. It is not a MarkOrbit-wide GA declaration and it does not imply that the external MarkOrbit Core ReadyPackage V2 receiver has been activated.

## Release candidate gate

A commit is eligible to become the `v0.1.0` release commit only when the dedicated **Knowledge v0.1 Release Candidate** workflow succeeds on that exact commit.

The workflow must prove all of the following:

1. root and Workspace package versions are consistently `0.1.0`;
2. package manager and Node support boundaries remain pinned;
3. README, release-readiness document, this closeout document and CHANGELOG agree on the release version;
4. no `.env`, runtime `.data`, Python bytecode, `__pycache__`, or one-time formatter/patch workflow is tracked;
5. discovered persistence migration IDs are unique;
6. the quiesced/cold SQLite + RawArtifact CAS + Staging CAS backup/restore drill succeeds;
7. full `pnpm check` succeeds on Node 22 and Node 24;
8. Local Folder, Email and document-extraction production Python Worker tests succeed;
9. an immutable workflow artifact records the candidate commit and successful gate result.

Live external-source smoke workflows remain manual/non-blocking because external authority availability and transient network failures are not deterministic repository-release signals.

## Release procedure after merge

The release owner performs these steps explicitly. No workflow in v0.1.0 may auto-tag, auto-publish or auto-deploy.

1. Merge the release-closeout PR manually after all required PR checks are green.
2. Record the exact merged `main` commit SHA.
3. Manually dispatch **Knowledge v0.1 Release Candidate** against that exact `main` commit with `release_version=0.1.0`.
4. Require all jobs to pass and retain the candidate evidence artifact.
5. Before upgrading a production/self-hosted installation, take a quiesced/cold coordinated backup following `docs/operations/KNOWLEDGE_V0_1_BACKUP_RESTORE.md`.
6. Only after steps 1-5 succeed, create the `v0.1.0` tag on the exact validated commit.
7. Create the GitHub Release from that tag using the `CHANGELOG.md` v0.1.0 section as the release notes basis.
8. Deploy only through the operator's explicit deployment process.

If the candidate workflow is rerun on a different commit, the previous evidence does not authorize that different commit. Revalidate the exact commit that will be tagged.

## Tag and release invariants

- `v0.1.0` must point to a commit whose root `package.json` version is `0.1.0`.
- The tagged commit must have successful Release Candidate evidence for the same SHA.
- No tag or GitHub Release should be created from an unmerged feature branch.
- No release workflow should have write permission to create refs or deployments automatically.
- A post-tag source-code change belongs to a later patch/minor release; do not move an existing published tag to a different commit.

## ReadyPackage V2 activation boundary

The Knowledge repository release and ReadyPackage V2 network activation are separate decisions.

For v0.1.0:

- K14-K16 delivery preparation, audit and reconciliation remain part of Knowledge;
- V2 outbound transport stays disabled unless a dedicated V2 endpoint, internal secret and protocol `1.0` are explicitly configured;
- V2 may not reuse the frozen V1 endpoint;
- V2-to-V1 fallback is forbidden;
- no automatic/background delivery retry is permitted.

A compatible external Core V2 receiver is required before V2 production traffic is enabled, but that external dependency does not block tagging the Knowledge repository itself.

## Backup/restore evidence boundary

The CI drill validates the release procedure's cold-copy mechanics with a synthetic SQLite database plus RawArtifact/Staging CAS objects. It does not claim to back up an operator's real production data.

Production operators must still:

- quiesce Knowledge before the backup;
- copy the real SQLite state and both configured CAS roots as one recovery point;
- separately include Vault files when Vault recovery is part of the objective;
- verify the restored environment before resuming writes.

## Post-release work

After `v0.1.0`, new Knowledge work remains inside the frozen architecture unless an explicit architecture review says otherwise.

Priority order:

1. connector/provider breadth when there is a concrete ingestion need;
2. deployment/backup automation when the deployment topology requires it;
3. operational and Admin/UI polish;
4. architecture changes only when the frozen v0.1 invariants genuinely cannot satisfy a required use case.

API, DATABASE, GITHUB and RSS remain the principal deferred connector families. They should reuse the existing Source → Connector → CollectionPlan → Run/Job → Worker → RawArtifact path rather than introduce parallel ingestion systems.
