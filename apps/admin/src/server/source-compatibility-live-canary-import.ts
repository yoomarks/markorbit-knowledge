import type { DatabaseSync } from "node:sqlite";
import type { SourceCompatibilityObservation } from "@markorbit/contracts";
import { parseRepresentativeLiveCanarySummary } from "@markorbit/persistence/source-compatibility-import";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";

export type SourceCompatibilityLiveCanaryImportResult = {
  imported: number;
  targetIds: string[];
  observations: SourceCompatibilityObservation[];
};

/**
 * Persists objective PASS/DEGRADED/BLOCKED observations from an already
 * completed Representative Source Live Canary V2 summary. Importing evidence
 * does not create or activate Sources, authorize collection, schedule work or
 * infer why an external system failed.
 */
export class SourceCompatibilityLiveCanaryImportService {
  private readonly observations: SqliteSourceCompatibilityObservationRepository;

  constructor(database: DatabaseSync) {
    this.observations = new SqliteSourceCompatibilityObservationRepository(database);
  }

  import(summary: unknown): SourceCompatibilityLiveCanaryImportResult {
    const inputs = parseRepresentativeLiveCanarySummary(summary);
    const observations = this.observations.recordMany(inputs);
    return {
      imported: observations.length,
      targetIds: [...new Set(observations.map((item) => item.targetId))].sort(),
      observations,
    };
  }
}
