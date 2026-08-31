import { sanitizeCnipaNetLog } from "./cnipa-offline-netlog-evidence";

type Arguments = {
  inputPath: string;
  outputPath: string;
};

export function parseCnipaOfflineNetLogArguments(argv: readonly string[]): Arguments {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--input" && argument !== "--output") {
      throw new Error(`Unsupported CNIPA offline NetLog argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    if (argument === "--input") {
      if (inputPath) throw new Error("--input may be specified only once");
      inputPath = value;
    } else {
      if (outputPath) throw new Error("--output may be specified only once");
      outputPath = value;
    }
    index += 1;
  }
  if (!inputPath || !outputPath) {
    throw new Error("CNIPA offline NetLog sanitization requires --input and --output");
  }
  return { inputPath, outputPath };
}

async function main(): Promise<void> {
  const arguments_ = parseCnipaOfflineNetLogArguments(process.argv.slice(2));
  const summary = await sanitizeCnipaNetLog(arguments_);
  process.stdout.write(
    `${JSON.stringify({
      evidenceKind: summary.evidence_kind,
      sourceSha256: summary.source_sha256,
      captureMode: summary.capture_mode,
      matchedEndpointEventCount: summary.candidate_endpoint_url_events.reduce(
        (total, item) => total + item.url_event_count,
        0,
      ),
      observedRequestStartCount: summary.observed_request_start_events.length,
      networkRequestPerformed: false,
      headersPersisted: false,
      cookiesPersisted: false,
      queryValuesPersisted: false,
      responseBodyPersisted: false,
    })}\n`,
  );
}

main().catch(() => {
  process.stderr.write(
    `${JSON.stringify({
      event: "cnipa.offline.netlog.sanitize.failed",
      message:
        "CNIPA NetLog sanitization failed. Stop Chrome logging and ensure the input is complete JSON. No raw log content was printed.",
    })}\n`,
  );
  process.exitCode = 1;
});
