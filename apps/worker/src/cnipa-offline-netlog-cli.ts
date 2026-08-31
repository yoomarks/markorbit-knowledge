export type CnipaOfflineNetLogArguments = {
  inputPath: string;
  outputPath: string;
};

export type CnipaOfflineNetLogFailureKind =
  | "ARGUMENT_ERROR"
  | "INPUT_UNREADABLE"
  | "INVALID_JSON"
  | "SANITIZE_FAILED";

export function parseCnipaOfflineNetLogArguments(
  argv: readonly string[],
): CnipaOfflineNetLogArguments {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  let inputPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < normalized.length; index += 1) {
    const argument = normalized[index];
    if (argument === "--") {
      throw new Error(
        "CNIPA offline NetLog argument separator is allowed only as the first argument",
      );
    }
    if (argument !== "--input" && argument !== "--output") {
      throw new Error(`Unsupported CNIPA offline NetLog argument: ${argument}`);
    }

    const value = normalized[index + 1];
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

function nodeErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function classifyCnipaOfflineNetLogFailure(
  error: unknown,
): CnipaOfflineNetLogFailureKind {
  if (error instanceof SyntaxError) return "INVALID_JSON";

  const code = nodeErrorCode(error);
  if (
    code === "ENOENT" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "EISDIR"
  ) {
    return "INPUT_UNREADABLE";
  }

  if (error instanceof Error) {
    const message = error.message;
    if (
      message.startsWith("Unsupported CNIPA offline NetLog argument:") ||
      message.startsWith("CNIPA offline NetLog argument separator") ||
      message === "CNIPA offline NetLog sanitization requires --input and --output" ||
      message === "--input may be specified only once" ||
      message === "--output may be specified only once" ||
      message === "--input requires a value" ||
      message === "--output requires a value"
    ) {
      return "ARGUMENT_ERROR";
    }
  }

  return "SANITIZE_FAILED";
}

export function cnipaOfflineNetLogFailureMessage(
  kind: CnipaOfflineNetLogFailureKind,
): string {
  switch (kind) {
    case "ARGUMENT_ERROR":
      return "CNIPA NetLog command arguments are invalid. Use the documented --input/--output form. No raw log content was printed.";
    case "INPUT_UNREADABLE":
      return "CNIPA NetLog input could not be read. Verify the local input path and permissions. No raw log content was printed.";
    case "INVALID_JSON":
      return "CNIPA NetLog input is not complete valid JSON. Stop Chrome logging before sanitizing. No raw log content was printed.";
    case "SANITIZE_FAILED":
      return "CNIPA NetLog sanitization failed. No raw log content was printed.";
  }
}
