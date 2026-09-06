import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { apiError } from "./api-errors";
import { ControlPlaneOwnerAccessError } from "./control-plane-owner-auth";

const routePath = resolve(
  process.cwd(),
  "src/app/api/internal/control-plane/evidence-supply-health/route.ts",
);

describe("Control Plane Evidence Supply Health route boundary", () => {
  it("maps owner auth failures to their fail-closed HTTP status", async () => {
    const response = apiError(
      new ControlPlaneOwnerAccessError("PERMISSION_DENIED", 403, "Knowledge read denied."),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "PERMISSION_DENIED", message: "Knowledge read denied." },
    });
  });

  it("authenticates the dedicated owner boundary before reading the canonical projection", () => {
    const source = readFileSync(routePath, "utf8");
    const handlerIndex = source.indexOf("export async function GET");
    const authIndex = source.indexOf("authenticateControlPlaneOwnerReadRequest(", handlerIndex);
    const readIndex = source.indexOf("getControlPlaneEvidenceSupplyHealthOwnerView(", handlerIndex);
    expect(handlerIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeGreaterThan(handlerIndex);
    expect(readIndex).toBeGreaterThan(authIndex);
    expect(source).not.toContain("resolveAdminBrowserApiReadAccess");
    expect(source).not.toContain("authenticateCaseProducerRequest");
    expect(source).not.toContain("matter:read");
  });
});
