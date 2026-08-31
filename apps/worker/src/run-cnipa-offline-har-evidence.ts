import { importCnipaOfflineHarEvidence } from "./cnipa-offline-har-evidence";

type Arguments = {
  inputPath: string;
  outputDirectory: string;
};

function parseArguments(argv: readonly string[]): Arguments {
  let inputPath: string | undefined;
  let outputDirectory: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--input" && argument !== "--output") {
      throw new Error(`Unsupported CNIPA offline HAR argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    if (argument === "--input") {
      if (inputPath) throw new Error("--input may be specified only once");
      inputPath = value;
    } else {
      if (outputDirectory) throw new Error("--output may be specified only once");
      outputDirectory = value;
    }
    index += 1;
  }
  if (!inputPath || !outputDirectory) {
    throw new Error("CNIPA offline HAR import requires --input and --output");
  }
  return { inputPath, outputDirectory };
}

export function parseCnipaOfflineHarArguments(argv: readonly string[]): Arguments {
  return parseArguments(argv);
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const manifest = await importCnipaOfflineHarEvidence(arguments_);
  process.stdout.write(
    `${JSON.stringify({
      schema: manifest.schema,
      matchedEntryCount: manifest.matchedEntryCount,
      observedHost: manifest.observedHost,
      networkRequestPerformed: false,
      requestHeadersPersisted: false,
      cookiesPersisted: false,
      credentialValuesPersisted: false,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "cnipa.offline.har.import.failed",
      message: error instanceof Error ? error.message : "CNIPA offline HAR import failed",
    })}\n`,
  );
  process.exitCode = 1;
});
