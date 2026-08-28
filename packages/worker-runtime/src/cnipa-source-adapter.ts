import type { SourceAdapterPort } from "./source-adapter-port";
import {
  CNIPA_JUDGMENT_SCHEMA_REVISION,
  CNIPA_JUDGMENT_SCHEMA_STATUS,
  CnipaAcquisitionError,
  assertCnipaSessionResponse,
  buildCnipaCandidateDetailRequest,
  buildCnipaCandidateListRequest,
  cnipaResponseEvidence,
  parseCnipaJson,
  parseCnipaTrademarkJudgmentQuery,
  provisionalCnipaDocumentIdentity,
  resolveCnipaDocumentKinds,
  type CnipaAuthenticatedRequest,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaAuthenticatedSessionResponse,
  type CnipaJudgmentCollection,
  type CnipaJudgmentResponseDecoder,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export * from "./cnipa-trademark-judgment";

export type CnipaSourceAdapterOptions = {
  maxDetailRequestsPerRun?: number;
};

function boundedDetailLimit(value: number | undefined): number {
  const resolved = value ?? 30;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      "maxDetailRequestsPerRun must be an integer between 1 and 100",
      false,
    );
  }
  return resolved;
}

export class CnipaSourceAdapter implements SourceAdapterPort {
  readonly sourceId = "CNIPA";
  private readonly maxDetailRequestsPerRun: number;

  constructor(
    private readonly executor: CnipaAuthenticatedSessionExecutor,
    private readonly decoder: CnipaJudgmentResponseDecoder,
    options: CnipaSourceAdapterOptions = {},
  ) {
    this.maxDetailRequestsPerRun = boundedDetailLimit(options.maxDetailRequestsPerRun);
  }

  private async execute(
    request: CnipaAuthenticatedRequest,
  ): Promise<CnipaAuthenticatedSessionResponse> {
    try {
      return assertCnipaSessionResponse(await this.executor.execute(request));
    } catch (error) {
      if (error instanceof CnipaAcquisitionError) throw error;
      throw new CnipaAcquisitionError(
        "CNIPA_DELIVERY_UNKNOWN",
        "CNIPA authenticated request delivery/result is unknown; automatic replay is disabled",
        false,
        undefined,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }

  async fetch(request: unknown): Promise<CnipaJudgmentCollection> {
    const query = parseCnipaTrademarkJudgmentQuery(request);
    return this.collect(query);
  }

  async collect(query: CnipaTrademarkJudgmentQuery): Promise<CnipaJudgmentCollection> {
    const normalizedQuery = parseCnipaTrademarkJudgmentQuery(query);
    const documents: CnipaJudgmentCollection["documents"] = [];
    const evidence: CnipaJudgmentCollection["evidence"] = [];
    const coverageReasons = new Set<string>([
      "CNIPA endpoint/response schema is operator-supplied and not yet authenticated-live-verified",
      "Pagination and the reported 100-result boundary are not yet authenticated-live-verified",
    ]);
    let detailRequests = 0;

    for (const documentKind of resolveCnipaDocumentKinds(normalizedQuery)) {
      const listRequest = buildCnipaCandidateListRequest(documentKind, normalizedQuery);
      const listResponse = await this.execute(listRequest);
      evidence.push(cnipaResponseEvidence(listResponse, listRequest));
      const page = this.decoder.decodeList(documentKind, parseCnipaJson(listResponse));
      const sourceRecordIds = [
        ...new Set(page.sourceRecordIds.map((value) => value.trim())),
      ].filter(Boolean);

      if (
        page.hasMore !== false ||
        (page.total !== undefined && page.total > sourceRecordIds.length)
      ) {
        coverageReasons.add(`${documentKind} list indicates or may contain additional pages`);
      }

      for (const sourceRecordId of sourceRecordIds) {
        detailRequests += 1;
        if (detailRequests > this.maxDetailRequestsPerRun) {
          throw new CnipaAcquisitionError(
            "CNIPA_DETAIL_LIMIT_EXCEEDED",
            `CNIPA detail request limit ${this.maxDetailRequestsPerRun} would be exceeded`,
            false,
          );
        }
        const detailRequest = buildCnipaCandidateDetailRequest(documentKind, sourceRecordId);
        const detailResponse = await this.execute(detailRequest);
        evidence.push(cnipaResponseEvidence(detailResponse, detailRequest, sourceRecordId));
        const decoded = this.decoder.decodeDetail(
          documentKind,
          sourceRecordId,
          parseCnipaJson(detailResponse),
        );
        if (decoded.sourceRecordId !== sourceRecordId) {
          throw new CnipaAcquisitionError(
            "CNIPA_SCHEMA_CHANGED",
            `CNIPA detail identity mismatch for ${documentKind}:${sourceRecordId}`,
            false,
          );
        }
        documents.push({
          ...decoded,
          identity: provisionalCnipaDocumentIdentity(documentKind, sourceRecordId),
          documentKind,
          identityStatus: "PROVISIONAL_UNTIL_AUTHENTICATED_LIVE_VALIDATION",
          sourceUri: detailResponse.sourceUri,
          observedSchemaRevision: CNIPA_JUDGMENT_SCHEMA_REVISION,
        });
      }
    }

    return {
      sourceId: "CNIPA",
      query: normalizedQuery,
      documents,
      evidence,
      coverageStatus: "UNKNOWN",
      coverageReasons: [...coverageReasons],
      schemaStatus: CNIPA_JUDGMENT_SCHEMA_STATUS,
      schemaRevision: CNIPA_JUDGMENT_SCHEMA_REVISION,
    };
  }
}
