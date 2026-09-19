import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import type { FactAdmissionClient, FactAdmissionReceipt } from "./fact-admission-http-client";
import {
  buildCnipaGazetteFactAdmissionReceiptArtifact,
  parseCnipaGazetteFactAdmissionRequestArtifact,
} from "./cnipa-gazette-fact-admission-artifacts";

export class CnipaGazetteFactAdmissionRequestPublisher {
  constructor(private readonly client: FactAdmissionClient) {}

  async publish(input: {
    requestArtifact: AcquiredCollectionArtifact;
    observedAt: string;
  }): Promise<{
    request: ReturnType<typeof parseCnipaGazetteFactAdmissionRequestArtifact>;
    receipt: FactAdmissionReceipt;
    receiptArtifact: AcquiredCollectionArtifact;
  }> {
    const request = parseCnipaGazetteFactAdmissionRequestArtifact(input.requestArtifact);
    const receipt = await this.client.post(request.path, request.payload);
    const receiptArtifact = buildCnipaGazetteFactAdmissionReceiptArtifact({
      requestArtifact: input.requestArtifact,
      receipt:
        request.operation === "CHUNK"
          ? (receipt as { outcome: "CHUNK_ADMITTED" })
          : (receipt as { outcome: "ADMITTED" }),
      observedAt: input.observedAt,
    });

    return { request, receipt, receiptArtifact };
  }
}
