import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadProductionValidationWave,
  parseProductionValidationManifest,
} from "./production-validation-wave";

const roots: string[] = [];
const originalRoot = process.env.MARKORBIT_REPOSITORY_ROOT;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.MARKORBIT_REPOSITORY_ROOT;
  else process.env.MARKORBIT_REPOSITORY_ROOT = originalRoot;
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("production validation wave loader", () => {
  it("loads the governed manifest from the repository root", () => {
    const root = mkdtempSync(join(tmpdir(), "markorbit-wave-"));
    roots.push(root);
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "production-validation-wave-1.json"),
      JSON.stringify({
        manifestVersion: "1.0",
        waveId: "official-wave-test",
        governance: {
          collectionAuthorizationRequired: true,
          discoveryDoesNotActivateSource: true,
          noAutomaticProductionScheduling: true,
          realObservationsOnly: true,
        },
        targets: [
          {
            id: "wo-wipo-trademarks",
            jurisdiction: "WO",
            authority: "World Intellectual Property Organization",
            canonicalUri: "https://www.wipo.int/en/web/trademarks",
            sourceClass: "OFFICIAL_AUTHORITY",
            priority: "P0",
            validationState: "PENDING_REAL_RUN",
          },
        ],
      }),
    );
    process.env.MARKORBIT_REPOSITORY_ROOT = root;

    const loaded = loadProductionValidationWave();
    expect(loaded.waveId).toBe("official-wave-test");
    expect(loaded.targets).toHaveLength(1);
  });

  it("rejects non-object manifests before intake", () => {
    expect(() => parseProductionValidationManifest([])).toThrow(
      "Production validation manifest must be an object",
    );
  });
});
