import { describe, expect, it } from "vitest";
import { workerMaxLeaseLifetimeMs } from "./source-registry";

describe("source registry worker lease configuration", () => {
  it("preserves the Worker Registry default when no override is configured", () => {
    expect(workerMaxLeaseLifetimeMs({})).toBeUndefined();
  });

  it("accepts an explicit governed long-running lease lifetime", () => {
    expect(
      workerMaxLeaseLifetimeMs({
        MARKORBIT_WORKER_MAX_LEASE_LIFETIME_MS: "1800000",
      }),
    ).toBe(1_800_000);
  });

  it("rejects unsafe or malformed lease lifetime overrides", () => {
    for (const value of ["119999", "3600001", "1.5", "not-a-number"]) {
      expect(() =>
        workerMaxLeaseLifetimeMs({
          MARKORBIT_WORKER_MAX_LEASE_LIFETIME_MS: value,
        }),
      ).toThrow(/MARKORBIT_WORKER_MAX_LEASE_LIFETIME_MS/);
    }
  });
});
