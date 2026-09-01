export type CnipaOfflineResponseBundleArguments = {
  descriptorPath: string;
  outputDirectory: string;
};

export type CnipaOfflineResponseBundleFailureKind =
  | "ARGUMENT_ERROR"
  | "INPUT_UNREADABLE"
  | "OUTPUT_ERROR"
  | "ASSESSMENT_FAILED";

export function parseCnipaOfflineResponseBundleArguments(
  argv: readonly string[],
): CnipaOfflineResponseBundleArguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  let descriptorPath: string | undefined;
  let outputDirectory: string | undefined;

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--") {
      throw new Error(
        "CNIPA offline response-bundle argument separator is allowed only as the first argument",
      );
    }
    if (argument !== "--descriptor" && argument !== "--output") {
      throw new Error(`Unsupported CNIPA offline response-bundle argument: ${argument}`);
    }

    const value = normalized[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);

    if (argument === "--descriptor") {
      if (descriptorPath) throw new Error("--descriptor may be specified only once");
      descriptorPath = value;
    } else {
      if (outputDirectory) throw new Error("--output may be specified only once");
      outputDirectory = value;
    }
    index += 1;
  }

  if (!descriptorPath || !outputDirectory) {
    throw new Error(
      "CNIPA offline response-bundle assessment requires --descriptor and --output",
    );
  }
  return { descriptorPath, outputDirectory };
}

function nodeErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function classifyCnipaOfflineResponseBundleFailure(
  error: unknown,
): CnipaOfflineResponseBundleFailureKind {
  const code = nodeErrorCode(error);
  if (code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "EISDIR") {
    return "INPUT_UNREADABLE";
  }
  if (code === "EEXIST" || code === "ENOSPC" || code === "EROFS") return "OUTPUT_ERROR";

  if (error instanceof Error) {
    const message = error.message;
    if (
      message.startsWith("Unsupported CNIPA offline response-bundle argument:") ||
      message.startsWith("CNIPA offline response-bundle argument separator") ||
      message ===
        "CNIPA offline response-bundle assessment requires --descriptor and --output" ||
      message === "--descriptor may be specified only once" ||
      message === "--output may be specified only once" ||
      message === "--descriptor requires a value" ||
      message === "--output requires a value"
    ) {
      return "ARGUMENT_ERROR";
    }
  }

  return "ASSESSMENT_FAILED";
}

export function cnipaOfflineResponseBundleFailureMessage(
  kind: CnipaOfflineResponseBundleFailureKind,
): string {
  switch (kind) {
    case "ARGUMENT_ERROR":
      return "CNIPA response-bundle command arguments are invalid. Use the documented --descriptor/--output form. No response content or local path was printed.";
    case "INPUT_UNREADABLE":
      return "CNIPA response-bundle input could not be read. Verify the local descriptor/response files and permissions. No response content or local path was printed.";
    case "OUTPUT_ERROR":
      return "CNIPA response-bundle assessment output could not be created. Use a new external output directory. No response content or local path was printed.";
    case "ASSESSMENT_FAILED":
      return "CNIPA response-bundle assessment failed closed. Review the local descriptor and files against the runbook. No response content or local path was printed.";
  }
}
