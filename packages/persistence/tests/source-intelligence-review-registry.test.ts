import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceObservationReviewRepository } from "../src/source-intelligence-review-registry";

describe("SqliteSourceIntelligenceObservationReviewRepository", () => {
  it("persists and updates one review occurrence without mutating its identity", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T03:00:00.000Z"),
      new Date("2026-08-09T03:05:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligenceObservationReviewRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T03:10:00.000Z"),
    );
    const observationKey = "sir_0123456789abcdef0123456789abcdef";

    const acknowledged = repository.save({
      observationKey,
      sourceId: "src_uspto",
      flagKind: "HIGH_VALUE_UNOBSERVED",
      currentAssessmentId: "si2_current",
      status: "ACKNOWLEDGED",
      reviewer: " operator ",
      note: " first note ",
    });
    expect(acknowledged.status).toBe("ACKNOWLEDGED");
    expect(acknowledged.reviewer).toBe("operator");
    expect(acknowledged.note).toBe("first note");

    const ignored = repository.save({
      observationKey,
      sourceId: "src_uspto",
      flagKind: "HIGH_VALUE_UNOBSERVED",
      currentAssessmentId: "si2_current",
      status: "IGNORED",
      reviewer: "operator",
    });
    expect(ignored.status).toBe("IGNORED");
    expect(ignored.createdAt).toBe("2026-08-09T03:00:00.000Z");
    expect(ignored.updatedAt).toBe("2026-08-09T03:05:00.000Z");
    expect(ignored.note).toBeUndefined();
    expect(repository.listByObservationKeys([observationKey])).toEqual([ignored]);
    database.close();
  });
});
