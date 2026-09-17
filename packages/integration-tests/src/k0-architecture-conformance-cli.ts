import { runK0ArchitectureConformance } from "./k0-architecture-conformance";

const diagnostics = runK0ArchitectureConformance();
if (diagnostics.length === 0) {
  console.log("K0 architecture conformance: PASS");
  process.exitCode = 0;
} else {
  console.error(`K0 architecture conformance: FAIL (${diagnostics.length} diagnostic(s))`);
  for (const diagnostic of diagnostics) {
    console.error(
      `::error file=${diagnostic.filePath}::[${diagnostic.ruleId}] ${diagnostic.message}`,
    );
  }
  process.exitCode = 1;
}
