import { describe, expect, it } from "vitest";

import {
  ExponentialRetryPolicy,
  MemoryPersistenceAdapter,
  MemoryQueueExecution,
} from "@markorbit/worker-runtime";

describe("production hardening smoke", () => {
  it("exposes persistence, queue and retry primitives", async () => {
    const persistence = new MemoryPersistenceAdapter();
    const queue = new MemoryQueueExecution();
    const retry = new ExponentialRetryPolicy();

    expect(persistence).toBeDefined();
    expect(queue).toBeDefined();
    expect(retry).toBeDefined();
  });
});
