# Conversion Control v1

## Boundary

MarkOrbit Knowledge converts immutable RawArtifacts into future Staging Documents. Conversion Control v1 separates four concerns:

```text
RawArtifact
    ↓
ConverterManifest Registry
    ↓
Conversion Profile (intent)
    ↓
Future ConversionRun / StagingDocument
```

This phase implements only the registries and intent. It does not execute converter code or write Markdown.

## ConverterManifest

A manifest is identified by `converterId + SemVer`. Its content is immutable after registration; only lifecycle status may change. It declares runtime class, accepted ArtifactKinds and MIME patterns, output format, capabilities, deterministic behavior, configuration JSON Schema and resource hints.

`ACTIVE` means the version may be selected by a Conversion Profile. Runtime health remains `NOT_EVALUATED` until an execution layer is introduced.

## Conversion Profile

A profile is Workspace-scoped and may optionally be Source-scoped. It binds an exact converter version to input match rules, output format, target Staging path template, validated configuration, precedence and auto-convert intent.

Profiles default to `PAUSED`. Enabling requires an exact ACTIVE compatible manifest. Archived profiles are terminal. `updatedAt` provides optimistic concurrency.

## Safety

Registry objects reject arbitrary commands, executable paths, shell/script/argument fields and secret-bearing configuration keys. The control plane never loads converter code and never invokes a process.

## Deferred

ConversionRun, retry policy, actual HTML/PDF/DOCX processing, Markdown creation, OCR, attachment extraction and Obsidian synchronization are separate future tasks.
