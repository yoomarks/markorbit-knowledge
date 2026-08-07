import { prepareReadyPackage, verifyReadyPackage } from "./ready-package";

function rootArgument(argv: string[]): string {
  const index = argv.indexOf("--root");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) throw new Error("Usage: --root <directory> [--verify]");
  return value;
}

try {
  const root = rootArgument(process.argv.slice(2));
  const verifyOnly = process.argv.includes("--verify");
  const manifest = verifyOnly ? verifyReadyPackage(root) : prepareReadyPackage(root).manifest;
  process.stdout.write(
    `${JSON.stringify({ status: verifyOnly ? "VERIFIED" : "READY", packageId: manifest.packageId, conversionRunId: manifest.conversionRunId, stagingDocumentId: manifest.stagingDocumentId, packageSha256: manifest.digest.value })}\n`,
  );
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ status: "ERROR", code: error instanceof Error && "code" in error ? error.code : "READY_PACKAGE_ERROR", message: error instanceof Error ? error.message : "Unknown error" })}\n`,
  );
  process.exitCode = 1;
}
