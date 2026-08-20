import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const productionRoots = ["apps", "packages", "workers"];
const ignoredDirectoryNames = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "tests",
  "__tests__",
  "fixtures",
  "__fixtures__",
]);
const allowedStorageImplementations = new Set([
  "packages/persistence/src/raw-artifact-registry.ts",
  "packages/persistence/src/raw-artifact-repository.ts",
]);

function isSourceFile(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

function isTestFile(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue;
      files.push(...walk(join(directory, entry.name)));
      continue;
    }
    if (entry.isFile() && isSourceFile(entry.name)) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function repoPath(path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

describe("RawArtifact production integrity boundary", () => {
  it("prevents production code from bypassing the integrity wrapper storage class", () => {
    const violations: string[] = [];

    for (const root of productionRoots) {
      for (const path of walk(resolve(repoRoot, root))) {
        const normalized = repoPath(path);
        if (isTestFile(normalized) || allowedStorageImplementations.has(normalized)) continue;

        const source = readFileSync(path, "utf8");
        const referencesLowLevelModule = source.includes("raw-artifact-registry");
        const referencesStorageClass = source.includes("SqliteRawArtifactRepository");
        if (referencesLowLevelModule && referencesStorageClass) violations.push(normalized);
      }
    }

    expect(violations).toEqual([]);
  });
});
