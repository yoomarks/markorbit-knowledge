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
  type CnipaDocumentKind,
  type CnipaJudgmentCollection,
  type CnipaJudgmentResponseDecoder,
  type CnipaTrademarkJudgmentQuery,
} from "./cnipa-trademark-judgment";

export * from "./cnipa-frontend-static-contract";
export * from "./cnipa-trademark-judgment";

export type CnipaSourceAdapterOptions = {
  maxDetailRequestsPerRun?: number;
  maxPagesPerLibrary?: number;
  pageSize?: number;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new CnipaAcquisitionError(
      "CNIPA_QUERY_INVALID",
      `${label} must be an integer between ${minimum} and ${maximum}`,
      false,
    );
  }
  return resolved;
}

function pagedListRequest(
  documentKind: CnipaDocumentKind,
  query: CnipaTrademarkJudgmentQuery,
  pageIndex: number,
  pageSize: number,
): CnipaAuthenticatedRequest {
  const request = buildCnipaCandidateListRequest(documentKind, query);
  return {
    ...request,
    jsonBody: {
      ...(request.jsonBody ?? {}),
      pageIndex,
      pageSize,
    },
  };
}

export class CnipaSourceAdapter implements SourceAdapterPort {
  readonly sourceId = "CNIPA";
  private readonly maxDetailRequestsPerRun: number;
  private readonly maxPagesPerLibrary: number;
  private readonly pageSize: number;

  constructor(
    private readonly executor: CnipaAuthenticatedSessionExecutor,
    private readonly decoder: CnipaJudgmentResponseDecoder,
    options: CnipaSourceAdapterOptions = {},
  ) {
    this.maxDetailRequestsPerRun = boundedInteger(
      options.maxDetailRequestsPerRun,
      30,
      1,
      100,
      "maxDetailRequestsPerRun",
    );
    this.maxPagesPerLibrary = boundedInteger(
      options.maxPagesPerLibrary,
      10,
      1,
      50,
      "maxPagesPerLibrary",
    );
    this.pageSize = boundedInteger(options.pageSize, 10, 1, 100, "pageSize");
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
      const sourceRecordIds = new Set<string>();
      let pageIndex = 1;

      while (pageIndex <= this.maxPagesPerLibrary) {
        const listRequest = pagedListRequest(
          documentKind,
          normalizedQuery,
          pageIndex,
          this.pageSize,
        );
        const listResponse = await this.execute(listRequest);
        evidence.push(cnipaResponseEvidence(listResponse, listRequest));
        const page = this.decoder.decodeList(documentKind, parseCnipaJson(listResponse));
        const pageIds = [...new Set(page.sourceRecordIds.map((value) => value.trim()))].filter(
          Boolean,
        );
        for (const sourceRecordId of pageIds) sourceRecordIds.add(sourceRecordId);

        if (page.hasMore === true && pageIds.length === 0) {
          throw new CnipaAcquisitionError(
            "CNIPA_SCHEMA_CHANGED",
            `${documentKind} reported hasMore=true with an empty page`,
            false,
          );
        }

        const observed = sourceRecordIds.size;
        const definitelyComplete =
          page.hasMore === false ||
          pageIds.length === 0 ||
          (page.total !== undefined && observed >= page.total);
        if (definitelyComplete) break;

        const definitelyMore =
          page.hasMore === true || (page.total !== undefined && observed < page.total);
        if (!definitelyMore) {
          coverageReasons.add(
            `${documentKind} pagination metadata is insufficient to prove whether another page exists`,
          );
          break;
        }
        if (pageIndex === this.maxPagesPerLibrary) {
          coverageReasons.add(
            `${documentKind} reached the configured ${this.maxPagesPerLibrary}-page safety ceiling while more results may exist`,
          );
          break;
        }
        pageIndex += 1;
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
