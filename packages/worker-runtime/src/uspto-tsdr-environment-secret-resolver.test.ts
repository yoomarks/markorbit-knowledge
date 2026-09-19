import { describe, expect, it } from "vitest";
import {
  UsptoTsdrEnvironmentSecretResolver,
  UsptoTsdrSecretResolutionError,
  usptoTsdrSecretEnvironmentName,
} from "./uspto-tsdr-environment-secret-resolver";

const SECRET_REF = "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ENV_NAME = "MARKORBIT_SECRET_BINDING_SEC_01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("UsptoTsdrEnvironmentSecretResolver", () => {
  it("derives a deterministic runtime binding name from a Schema v1 secretRef", () => {
    expect(usptoTsdrSecretEnvironmentName(SECRET_REF)).toBe(ENV_NAME);
  });

  it("resolves only the value bound to the referenced runtime environment name", async () => {
    const resolver = new UsptoTsdrEnvironmentSecretResolver({
      [ENV_NAME]: "  test-runtime-key  ",
      USPTO_API_KEY: "must-not-be-used",
    });

    await expect(resolver.resolve(SECRET_REF)).resolves.toBe("test-runtime-key");
  });

  it("fails closed when the governed binding is absent or blank", async () => {
    const missing = new UsptoTsdrEnvironmentSecretResolver({});
    const blank = new UsptoTsdrEnvironmentSecretResolver({ [ENV_NAME]: "   " });

    await expect(missing.resolve(SECRET_REF)).rejects.toMatchObject({
      code: "TSDR_SECRET_BINDING_MISSING",
    });
    await expect(blank.resolve(SECRET_REF)).rejects.toMatchObject({
      code: "TSDR_SECRET_BINDING_MISSING",
    });
  });

  it("rejects raw keys and malformed references before reading the environment", async () => {
    const resolver = new UsptoTsdrEnvironmentSecretResolver({
      MARKORBIT_SECRET_BINDING_RAW_API_KEY: "hidden",
    });

    await expect(resolver.resolve("raw-api-key")).rejects.toMatchObject({
      code: "TSDR_SECRET_REFERENCE_INVALID",
    });
  });

  it("does not disclose a secret value in resolution errors", async () => {
    const secret = "super-sensitive-provider-key";
    const resolver = new UsptoTsdrEnvironmentSecretResolver({
      [ENV_NAME]: secret,
    });

    try {
      await resolver.resolve("not-a-secret-ref");
      throw new Error("expected resolution to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UsptoTsdrSecretResolutionError);
      expect(String(error)).not.toContain(secret);
    }
  });
});
