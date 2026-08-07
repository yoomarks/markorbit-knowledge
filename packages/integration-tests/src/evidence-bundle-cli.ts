import { resolve } from "node:path";
import { verifyEvidenceBundle } from "./evidence-bundle";

function parseRoot(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--root" || !args[1]) {
    throw new Error("Usage: verify:evidence --root PATH");
  }
  return resolve(args[1]);
}

try {
  const result = verifyEvidenceBundle(parseRoot(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const payload = {
    status: "ERROR",
    code:
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "EVIDENCE_BUNDLE_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : "Evidence bundle verification failed",
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
}
