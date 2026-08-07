import { describe, expect, it } from "vitest";
import { ExponentialRetryPolicy } from "@markorbit/worker-runtime";

describe("failure recovery boundary", () => {
  it("returns retry decision for retryable failures", () => {
    const policy = new ExponentialRetryPolicy({ maxAttempts: 3 });
    const decision = policy.evaluate({
      attempt: 1,
      failure: { code: "TIMEOUT", retryable: true },
    });

    expect(decision.retry).toBe(true);
  });
});
