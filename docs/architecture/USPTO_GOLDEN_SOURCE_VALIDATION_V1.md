# USPTO Golden Source Validation v1

## Goal

Validate the complete MarkOrbit Knowledge acquisition chain against a real official trademark authority source before expanding source coverage.

## Boundary

USPTO is used as a production proving ground. This increment validates ingestion and evidence flow, not legal conclusions.

## Flow

```
Controlled Discovery
        ↓
Source acceptance
        ↓
Crawl4AI collection
        ↓
RawArtifact finalize
        ↓
Source Graph extraction
        ↓
Source Map evidence
        ↓
Conversion / ReadyPackage candidate
```

## Success criteria

- official USPTO source is represented as a governed Source;
- collected artifacts remain immutable;
- every derived observation retains RawArtifact provenance;
- replaying the same artifact produces identical evidence;
- conversion output can trace every field back to source evidence;
- no automated step upgrades observed evidence into legal truth.

## Initial dataset

Start with a small controlled sample:

- trademark search/result pages;
- owner/applicant information pages;
- status/event information pages;
- downloadable official documents when available.

## Explicit exclusions

This validation does not:

- replace USPTO records;
- make legal judgments;
- resolve ownership disputes;
- infer attorney qualification;
- crawl unrelated external domains.

## Next implementation steps

1. Add official source profile fixture.
2. Add acquisition replay fixture.
3. Run RawArtifact → Source Graph pipeline with real-shaped documents.
4. Add conversion trace assertions.
