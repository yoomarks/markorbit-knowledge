# MarkOrbit Knowledge Next Phase

## Production Acquisition Layer

Current completed boundary:

Source → Collection → Artifact → Conversion → Staging → ReadyPackage → Core Intake

## Next implementation targets

### P1
- Production source connectors
- Collection execution runtime
- Artifact ingestion integration
- Pipeline observability

### P2
- Scheduler
- Retry policy
- External repository intake
- Scalable ingestion workers

## Principles

- Worker runtime does not own business state.
- ReadyPackage remains the Knowledge/Core boundary.
- RawArtifact remains immutable evidence.
