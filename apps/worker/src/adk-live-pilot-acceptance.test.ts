import { describe, expect, it } from "vitest";
import {
  assertLivePilotComplete,
  type LivePilotLineage,
  type LivePilotReceiptView,
} from "./adk-live-pilot-acceptance";

const assignments = ["kas_us_section8", "kas_au_renewal", "kas_ca_office_action"] as const;
const providers = ["DEEPSEEK", "OPENAI"] as const;

function receipts(): LivePilotReceiptView[] {
  return assignments.flatMap((assignmentId) =>
    providers.map((provider) => ({
      assignmentId,
      provider,
      status: "EXECUTED",
      submissionId: `ars_${assignmentId}_${provider.toLowerCase()}`,
      artifactId: `adk_${assignmentId}_${provider.toLowerCase()}`,
    })),
  );
}

function lineage(): LivePilotLineage[] {
  return assignments.flatMap((assignmentId) =>
    providers.map((provider) => ({
      assignmentId,
      provider,
      submissionId: `ars_${assignmentId}_${provider.toLowerCase()}`,
      distilledArtifactId: `adk_${assignmentId}_${provider.toLowerCase()}`,
      rawProviderArtifactId: `art_raw_${assignmentId}_${provider.toLowerCase()}`,
      markdownRawArtifactId: `art_md_${assignmentId}_${provider.toLowerCase()}`,
    })),
  );
}

describe("ADK live pilot acceptance", () => {
  it("accepts only a complete six-cell execution with matching RawArtifact lineage", () => {
    expect(() =>
      assertLivePilotComplete({
        receipts: receipts(),
        acquisitionCount: 6,
        lineage: lineage(),
      }),
    ).not.toThrow();
  });

  it("rejects a blocked credential even when five cells executed", () => {
    const values = receipts();
    values[5] = {
      assignmentId: values[5]!.assignmentId,
      provider: values[5]!.provider,
      status: "BLOCKED_CREDENTIAL",
      errorCode: "AI_PROVIDER_CREDENTIAL_MISSING",
      retryable: false,
    };
    expect(() =>
      assertLivePilotComplete({
        receipts: values,
        acquisitionCount: 5,
        lineage: lineage().slice(0, 5),
      }),
    ).toThrow(/all 6 intended cells/iu);
  });

  it("rejects missing or mismatched RawArtifact lineage", () => {
    const values = lineage();
    values[5] = { ...values[5]!, submissionId: "ars_wrong_submission" };
    expect(() =>
      assertLivePilotComplete({
        receipts: receipts(),
        acquisitionCount: 6,
        lineage: values,
      }),
    ).toThrow(/lineage for every receipt/iu);
  });
});
