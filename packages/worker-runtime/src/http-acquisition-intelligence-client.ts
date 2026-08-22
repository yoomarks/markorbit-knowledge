import {
  isAcquisitionRunEvidence,
  type AcquisitionPlaybookHistory,
  type AcquisitionRunEvidence,
} from "@markorbit/contracts";
import { WorkerControlPlaneHttpError } from "./http-controlled-collection-client";

export type AcquisitionIntelligenceIntakeReceipt = {
  version: "ACQUISITION_INTELLIGENCE_WORKER_INTAKE_V1";
  workerId: string;
  runId: string;
  sourceId: string;
  executionAttemptId: string;
  replayed: boolean;
  lessonsRecorded: number;
  playbookHistory: AcquisitionPlaybookHistory;
  strategyCandidateId: string | null;
  strategyCandidateStage: string | null;
  strategyCandidateEvidenceCount: number;
  reevaluationRequestId: string | null;
};

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Worker control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseReceipt(value: unknown): AcquisitionIntelligenceIntakeReceipt {
  const payload = record(value);
  const history = record(payload?.playbookHistory);
  if (
    payload?.version !== "ACQUISITION_INTELLIGENCE_WORKER_INTAKE_V1" ||
    typeof payload.workerId !== "string" ||
    typeof payload.runId !== "string" ||
    typeof payload.sourceId !== "string" ||
    typeof payload.executionAttemptId !== "string" ||
    typeof payload.replayed !== "boolean" ||
    typeof payload.lessonsRecorded !== "number" ||
    (payload.strategyCandidateId !== null && typeof payload.strategyCandidateId !== "string") ||
    (payload.strategyCandidateStage !== null && typeof payload.strategyCandidateStage !== "string") ||
    typeof payload.strategyCandidateEvidenceCount !== "number" ||
    (payload.reevaluationRequestId !== null && typeof payload.reevaluationRequestId !== "string") ||
    !history ||
    typeof history.runs !== "number" ||
    typeof history.successRate !== "number" ||
    (history.averageCoverage !== null && typeof history.averageCoverage !== "number") ||
    (history.averageDurationMs !== null && typeof history.averageDurationMs !== "number")
  ) {
    throw new Error("Acquisition intelligence intake response is invalid");
  }
  return payload as AcquisitionIntelligenceIntakeReceipt;
}

export class HttpAcquisitionIntelligenceClient {
  private readonly baseUrl: string;
  private readonly workerId: string;

  constructor(
    baseUrl: string,
    workerId: string,
    private readonly credential: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
    this.workerId = workerId.trim();
    if (!this.workerId) throw new Error("workerId is required");
    if (!credential.trim()) throw new Error("worker credential is required");
  }

  async recordRun(evidence: AcquisitionRunEvidence): Promise<AcquisitionIntelligenceIntakeReceipt> {
    if (!isAcquisitionRunEvidence(evidence)) {
      throw new Error("Acquisition learning evidence is invalid");
    }
    const response = await this.fetcher(
      `${this.baseUrl}/api/worker/v1/acquisition-intelligence/runs`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.credential}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ workerId: this.workerId, evidence }),
      },
    );
    if (!response.ok) {
      let message = `Acquisition intelligence intake failed (${response.status})`;
      try {
        const payload = record(await response.json());
        const error = record(payload?.error);
        if (typeof error?.message === "string") message = error.message;
      } catch {
        // Preserve the transport-level fallback message.
      }
      throw new WorkerControlPlaneHttpError(response.status, message);
    }
    return parseReceipt(await response.json());
  }
}
