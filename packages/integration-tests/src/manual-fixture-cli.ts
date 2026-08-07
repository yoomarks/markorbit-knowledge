import { runManualFixturePipelineWithManifest } from "./manual-fixture-manifest-runner";
import { parseManualFixtureArguments } from "./manual-fixture-runner";

async function main(): Promise<void> {
  try {
    const input = parseManualFixtureArguments(process.argv.slice(2));
    const summary = await runManualFixturePipelineWithManifest(input);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    const payload = {
      status: "ERROR",
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "MANUAL_FIXTURE_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : "Unexpected local manual runner failure",
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
