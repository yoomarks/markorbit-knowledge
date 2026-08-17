import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { startSourceCompatibilityReprobeExecution } from "./source-compatibility-reprobe-executions";

describe("source compatibility re-probe execution worker boundary", () => {
  it("authenticates before initializing intent or re-probe write ledgers", () => {
    const database = new DatabaseSync(":memory:");
    const workers = {
      verifyCredential() {
        throw new Error("authentication rejected");
      },
    };

    expect(() =>
      startSourceCompatibilityReprobeExecution(
        {
          workerId: "worker.compatibility",
          credential: "wrong",
          intentId: "fai_0123456789abcdef0123456789abcdef",
          executedByActorId: "operator.executor",
          idempotencyKey: "reprobe-cn-search-1",
        },
        { database, workers },
      ),
    ).toThrow("authentication rejected");

    const foundationalLedger = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'foundational_action_intents'",
      )
      .get();
    const reprobeLedger = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_compatibility_reprobe_executions'",
      )
      .get();
    expect(foundationalLedger).toBeUndefined();
    expect(reprobeLedger).toBeUndefined();
    database.close();
  });
});
