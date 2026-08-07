# MarkOrbit Knowledge System Boundaries

## Ownership

MarkOrbit Knowledge owns acquisition and staging control:

- source registration and collection intent;
- provider routing and declarative job orchestration;
- raw artifact registration, immutability and versioning;
- format conversion orchestration;
- Obsidian Vault transfer and validation;
- Ready Package delivery.

## Execution providers

Mo Crawl and other connectors are replaceable execution providers. They execute constrained collection or conversion requests and return normalized results. They do not own source business policy or MarkOrbit knowledge semantics.

## Obsidian

Obsidian is the default Knowledge Staging implementation. The durable integration boundary is Markdown, YAML properties, Wiki Links, attachments and file/Git history. Core protocols must not depend on an optional Obsidian community plugin.

## MarkOrbit Core

MarkOrbit Core exclusively owns information understanding, entity and relationship interpretation, distillation, knowledge and capability objects, value scoring, recommendations and Next Best Action. Core logic must not be moved into this repository.

## Worker security

Central services may send only declarative, schema-validated tasks. Arbitrary shell, Python, PowerShell, JavaScript or binary execution from remote task payloads is forbidden.

## Raw artifact invariant

Raw artifacts are immutable evidence. Content changes create a new version; they never overwrite the earlier artifact. Derived Markdown and previews must retain provenance back to the raw version.
