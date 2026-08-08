import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceObservationReviewRepository } from "../src/source-intelligence-review-registry";

describe("SqliteSourceIntelligenceObservationReviewRepository", () => {
  it("persists review snapshots and appends source-level review events", () => {
    const database = new DatabaseSync(":memory:");
    const times = [new Date("2026-08-09T03:00:00.000Z"), new Date("2026-08-09T03:05:00.000Z")];
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

    const events = repository.listEvents({ sourceIds: ["src_uspto"], limit: 10 });
    expect(events).toHaveLength(2);
    expect(events[0]?.status).toBe("IGNORED");
    expect(events[0]?.previousStatus).toBe("ACKNOWLEDGED");
    expect(events[0]?.action).toBe("DISPOSITION_CHANGED");
    expect(events[1]?.status).toBe("ACKNOWLEDGED");
    expect(events[1]?.previousStatus).toBe("PENDING");
    expect(events[1]?.occurredAt).toBe("2026-08-09T03:00:00.000Z");
    database.close();
  });

  it("backfills one explicit snapshot event for pre-D2.10 D2.9 review rows", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE source_intelligence_observation_reviews (
        observation_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        flag_kind TEXT NOT NULL,
        current_assessment_id TEXT NOT NULL,
        previous_assessment_id TEXT,
        status TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO source_intelligence_observation_reviews VALUES (
        'sir_abcdefabcdefabcdefabcdefabcdefab',
        'src_legacy',
        'SOURCE_VALUE_BAND_CHANGED',
        'si2_legacy',
        NULL,
        'ACKNOWLEDGED',
        'legacy-operator',
        'known D2.9 state',
        '2026-08-08T12:00:00.000Z',
        '2026-08-08T12:00:00.000Z'
      );
    `);

    const repository = new SqliteSourceIntelligenceObservationReviewRepository(database);
    const events = repository.listEvents({ sourceIds: ["src_legacy"] });
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("SNAPSHOT_BACKFILL");
    expect(events[0]?.previousStatus).toBe("PENDING");
    expect(events[0]?.status).toBe("ACKNOWLEDGED");
    expect(events[0]?.occurredAt).toBe("2026-08-08T12:00:00.000Z");
    database.close();
  });
});
