import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy source compatibility intake", () => {
  it("fails closed without touching persistence", async () => {
    const response = POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SOURCE_COMPATIBILITY_AUTHENTICATED_WORKER_REQUIRED",
        message:
          "Unauthenticated source compatibility intake is disabled. Record representative live-canary observations through the authenticated /api/worker/v1/source-compatibility-observations endpoint.",
      },
    });
  });
});
