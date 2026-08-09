import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteSourceIntelligenceObservationOwnershipRepository } from "../src/source-intelligence-review-ownership-registry";

const observationKey = "sir_0123456789abcdef0123456789abcdef";

function baseInput() {
  return {
    observationKey,
    sourceId: "src_uspto",
    flagKind: "HIGH_VALUE_UNOBSERVED" as const,
    actor: "ops-lead",
  };
}

describe("D2.11 ownership persistence", () => {
  it("records claim, transfer, release, and handoff events", () => {
    const database = new DatabaseSync(":memory:");
    const times = [
      new Date("2026-08-09T00:00:00.000Z"),
      new Date("2026-08-09T00:05:00.000Z"),
      new Date("2026-08-09T00:10:00.000Z"),
    ];
    const repository = new SqliteSourceIntelligenceObservationOwnershipRepository(
      database,
      () => times.shift() ?? new Date("2026-08-09T00:15:00.000Z"),
    );
    expect(
      repository.save({
        ...baseInput(),
        action: "CLAIMED",
        owner: "alice",
        expectedOwner: null,
      }).owner,
    ).toBe("alice");
    expect(
      repository.save({
        ...baseInput(),
        action: "TRANSFERRED",
        owner: "bob",
        expectedOwner: "alice",
      }).owner,
    ).toBe("bob");
    const released = repository.save({
      ...baseInput(),
      action: "RELEASED",
      expectedOwner: "bob",
    });
    expect(released.owner).toBeNull();
    expect(released.assignedAt).toBeNull();

    const events = repository.listEvents({ sourceIds: ["src_uspto"], limit: 10 });
    expect(events.map((event) => event.action)).toEqual(["RELEASED", "TRANSFERRED", "CLAIMED"]);
    expect(events[0]).toMatchObject({ previousOwner: "bob", owner: null, actor: "ops-lead" });
    expect(events[1]).toMatchObject({ previousOwner: "alice", owner: "bob" });
    expect(events[2]).toMatchObject({ previousOwner: null, owner: "alice" });
    database.close();
  });

  it("protects ownership with the expected owner value", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteSourceIntelligenceObservationOwnershipRepository(database);
    repository.save({
      ...baseInput(),
      action: "CLAIMED",
      owner: "alice",
      expectedOwner: null,
    });
    expect(() =>
      repository.save({
        ...baseInput(),
        action: "TRANSFERRED",
        owner: "bob",
        expectedOwner: "carol",
      }),
    ).toThrow(/changed before this handoff/);
    expect(repository.get(observationKey)?.owner).toBe("alice");
    database.close();
  });
});
