# Source Discovery Engine V1

## Purpose

MarkOrbit Knowledge remains a raw evidence acquisition and provenance control plane. It does not perform interpretation, reasoning, recommendation or content generation. Those responsibilities belong to MarkOrbit Core / Mo Brain.

Source Discovery extends Knowledge by improving how high-value sources are found and registered.

## Boundary

Knowledge owns:

- source discovery metadata;
- candidate source registration;
- source relationships;
- acquisition eligibility;
- provenance of discovery paths.

Knowledge does not own:

- semantic understanding;
- legal analysis;
- strategy extraction;
- content generation.

## Discovery flow

```text
Seed Sources
      ↓
Discovery Engine
      ↓
Candidate Sources
      ↓
Source Registry
      ↓
Approved Acquisition
      ↓
RawArtifact
      ↓
MarkOrbit Core
```

## Discovery methods

### Link discovery

Discover related sources through trusted external links, navigation structures and site maps.

Example:

WIPO source → national IP office source candidates.

### Citation discovery

Discover referenced documents, regulations and decisions from collected artifacts.

Example:

Trademark decision → cited rules, manuals and prior decisions.

### Similar source discovery

Discover related organizations and publications from source metadata, domains and public relationships.

### Sitemap/feed discovery

Detect structured publication channels such as news, publications, decisions and updates.

## Source Registry extension

Future source records may include:

- discovery origin;
- parent source;
- relationship type;
- source category;
- acquisition capability;
- review status.

## Quality principle

Discovery increases coverage. It must not bypass source governance. Newly discovered sources enter as candidates and require controlled activation before production acquisition.
