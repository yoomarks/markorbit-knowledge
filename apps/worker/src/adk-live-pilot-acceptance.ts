export type LivePilotReceiptView = {
  assignmentId: string;
  provider: string;
  status: string;
  submissionId?: string;
  artifactId?: string;
  errorCode?: string;
  retryable?: boolean;
};

export type LivePilotLineage = {
  assignmentId: string;
  provider: "DEEPSEEK" | "OPENAI";
  submissionId: string;
  distilledArtifactId: string;
  rawProviderArtifactId: string;
  markdownRawArtifactId: string;
};

export function toLivePilotReceiptView(
  receipt: LivePilotReceiptView,
): LivePilotReceiptView {
  return {
    assignmentId: receipt.assignmentId,
    provider: receipt.provider,
    status: receipt.status,
    ...(receipt.submissionId ? { submissionId: receipt.submissionId } : {}),
    ...(receipt.artifactId ? { artifactId: receipt.artifactId } : {}),
    ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}),
    ...(receipt.retryable !== undefined ? { retryable: receipt.retryable } : {}),
  };
}

export function assertLivePilotComplete(input: {
  receipts: readonly LivePilotReceiptView[];
  acquisitionCount: number;
  lineage: readonly LivePilotLineage[];
}): void {
  if (input.receipts.length !== 6) {
    throw new Error("ADK live pilot acceptance requires exactly 6 intended receipts");
  }
  if (input.receipts.some((receipt) => receipt.status !== "EXECUTED")) {
    throw new Error("ADK live pilot acceptance requires all 6 intended cells to be EXECUTED");
  }
  if (input.acquisitionCount !== 6) {
    throw new Error("ADK live pilot acceptance requires exactly 6 real acquisitions");
  }
  if (input.lineage.length !== 6) {
    throw new Error("ADK live pilot acceptance requires exactly 6 RawArtifact lineage records");
  }

  const receiptKeys = new Set(
    input.receipts.map(
      (receipt) =>
        `${receipt.assignmentId}:${receipt.provider}:${receipt.submissionId ?? ""}`,
    ),
  );
  const lineageKeys = new Set(
    input.lineage.map(
      (entry) => `${entry.assignmentId}:${entry.provider}:${entry.submissionId}`,
    ),
  );
  if (receiptKeys.size !== 6 || lineageKeys.size !== 6) {
    throw new Error("ADK live pilot acceptance requires six unique assignment/provider submissions");
  }
  for (const key of receiptKeys) {
    if (!lineageKeys.has(key)) {
      throw new Error("ADK live pilot acceptance requires RawArtifact lineage for every receipt");
    }
  }
}
