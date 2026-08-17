import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ManualFixtureRunnerError,
  parseManualFixtureArguments,
  runManualFixturePipeline,
} from "../src/manual-fixture-runner";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "markorbit-manual-runner-test-"));
  roots.push(value);
  return value;
}

describe("local manual fixture runner", () => {
  it("parses the explicit bounded CLI arguments", () => {
    expect(
      parseManualFixtureArguments([
        "--input",
        "sample.txt",
        "--output-dir",
        "run-output",
        "--execution-key",
        "manual-1",
      ]),
    ).toEqual({
      inputPath: "sample.txt",
      outputDirectory: "run-output",
      executionKey: "manual-1",
    });
    expect(() => parseManualFixtureArguments(["--input", "sample.txt"])).toThrow(
      "Both --input and --output-dir are required",
    );
    expect(() =>
      parseManualFixtureArguments([
        "--input",
        "sample.txt",
        "--output-dir",
        "run-output",
        "--unknown",
        "x",
      ]),
    ).toThrow("Unknown argument");
  });

  it("runs one real text pipeline and preserves redacted local evidence", async () => {
    const directory = root();
    const inputPath = join(directory, "input.txt");
    const outputDirectory = join(directory, "output");
    writeFileSync(inputPath, "Manual fixture pipeline.\n", "utf8");

    const summary = await runManualFixturePipeline({
      inputPath,
      outputDirectory,
      executionKey: "manual-success",
      clock: () => new Date("2026-07-19T04:00:00Z"),
    });

    expect(summary.status).toBe("COMPLETED");
    expect(summary.verificationOutcome).toBe("PASS");
    expect(summary.observedPhase).toBe("COMPLETED");
    expect(summary.input.fileName).toBe("input.txt");
    expect(existsSync(summary.output.databasePath)).toBe(true);
    expect(existsSync(summary.output.casDirectory)).toBe(true);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("tokenDigest");
    expect(serialized).not.toContain("tokenReference");
    expect(serialized).not.toContain("leaseToken");

    const databaseBytes = readFileSync(summary.output.databasePath);
    expect(databaseBytes.byteLength).toBeGreaterThan(0);
  }, 15_000);

  it("rejects missing, empty and reused output inputs with stable codes", async () => {
    const directory = root();
    const missing = join(directory, "missing.txt");
    await expect(
      runManualFixturePipeline({
        inputPath: missing,
        outputDirectory: join(directory, "missing-out"),
      }),
    ).rejects.toMatchObject({ code: "MANUAL_FIXTURE_INPUT_NOT_FOUND" });

    const empty = join(directory, "empty.txt");
    writeFileSync(empty, "", "utf8");
    await expect(
      runManualFixturePipeline({ inputPath: empty, outputDirectory: join(directory, "empty-out") }),
    ).rejects.toMatchObject({ code: "MANUAL_FIXTURE_INPUT_EMPTY" });

    const valid = join(directory, "valid.txt");
    const output = join(directory, "used-output");
    writeFileSync(valid, "valid\n", "utf8");
    const first = await runManualFixturePipeline({
      inputPath: valid,
      outputDirectory: output,
      executionKey: "first-run",
      clock: () => new Date("2026-07-19T04:00:00Z"),
    });
    expect(first.status).toBe("COMPLETED");
    await expect(
      runManualFixturePipeline({ inputPath: valid, outputDirectory: output }),
    ).rejects.toMatchObject({ code: "MANUAL_FIXTURE_OUTPUT_NOT_EMPTY" });
  });

  it("exposes stable typed errors", () => {
    const error = new ManualFixtureRunnerError("MANUAL_FIXTURE_TEST", "test");
    expect(error.name).toBe("ManualFixtureRunnerError");
    expect(error.code).toBe("MANUAL_FIXTURE_TEST");
  });
});
