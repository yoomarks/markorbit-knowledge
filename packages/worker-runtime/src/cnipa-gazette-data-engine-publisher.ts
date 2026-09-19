import type { CnipaGazetteCheckpoint } from "./cnipa-gazette-checkpoint-runtime";
import type {
  CnipaGazetteDatasetIdentityEnvelope,
  CnipaGazetteDataEngineChunkPackage,
  CnipaGazetteDataEngineFinalizePackage,
} from "./cnipa-gazette-data-engine-handoff";
import {
  buildCnipaGazetteDataEngineChunkPackage,
  buildCnipaGazetteDataEngineFinalizePackage,
} from "./cnipa-gazette-data-engine-handoff";
import type { FactAdmissionClient, FactAdmissionReceipt } from "./fact-admission-http-client";

export const CNIPA_GAZETTE_CHUNK_ADMISSION_PATH =
  "/api/admin/v2/fact-admissions/cn/trademark-gazette/chunks" as const;
export const CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH =
  "/api/admin/v2/fact-admissions/cn/trademark-gazette/finalize" as const;

export type CnipaGazetteChunkAdmissionReceipt = {
  outcome: "CHUNK_ADMITTED";
  contract_version?: string;
  announcement_issue?: number;
  source_dataset_sha256?: string;
  range_start_page?: number;
  range_end_page?: number;
  chunk_row_count?: number;
  chunk_fingerprint?: string;
  replayed?: boolean;
};

export type CnipaGazetteFinalizeAdmissionReceipt = {
  outcome: "ADMITTED";
  contract_version?: string;
  announcement_issue?: number;
  source_dataset_sha256?: string;
  record_count?: number;
  page_count?: number;
  chunk_count?: number;
  replayed?: boolean;
};

function requiredOutcome<TExpected extends string>(
  receipt: FactAdmissionReceipt,
  expected: TExpected,
  operation: string,
): FactAdmissionReceipt & { outcome: TExpected } {
  if (receipt.outcome !== expected) {
    throw new Error(
      `${operation} returned unexpected outcome ${String(receipt.outcome ?? "<missing>")}`,
    );
  }
  return receipt as FactAdmissionReceipt & { outcome: TExpected };
}

export class CnipaGazetteDataEnginePublisher {
  constructor(private readonly client: FactAdmissionClient) {}

  async publishChunk(input: {
    checkpoint: CnipaGazetteCheckpoint;
    datasetIdentity: CnipaGazetteDatasetIdentityEnvelope;
    collectedAt: string;
  }): Promise<{
    package: CnipaGazetteDataEngineChunkPackage;
    receipt: CnipaGazetteChunkAdmissionReceipt;
  }> {
    const payload = buildCnipaGazetteDataEngineChunkPackage(input);
    const receipt = requiredOutcome(
      await this.client.post(CNIPA_GAZETTE_CHUNK_ADMISSION_PATH, payload),
      "CHUNK_ADMITTED",
      "Gazette chunk admission",
    ) as CnipaGazetteChunkAdmissionReceipt;

    return { package: payload, receipt };
  }

  async finalize(input: {
    datasetIdentity: CnipaGazetteDatasetIdentityEnvelope;
    collectedAt: string;
  }): Promise<{
    package: CnipaGazetteDataEngineFinalizePackage;
    receipt: CnipaGazetteFinalizeAdmissionReceipt;
  }> {
    const payload = buildCnipaGazetteDataEngineFinalizePackage(input);
    const receipt = requiredOutcome(
      await this.client.post(CNIPA_GAZETTE_FINALIZE_ADMISSION_PATH, payload),
      "ADMITTED",
      "Gazette finalize admission",
    ) as CnipaGazetteFinalizeAdmissionReceipt;

    return { package: payload, receipt };
  }
}
