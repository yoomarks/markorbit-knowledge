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

export * from "./cnipa-trademark-judgment";
export * from "./cnipa-acquisition-intent";

export type CnipaSourceAdapterOptions = {
  maxDetailRequestsPerRun?: number;
  maxPagesPerLibrary?: number;
  pageSize?: number;
  maxTransientBusinessAttempts?: number;
  transientBusinessRetryBaseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
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

const CNIPA_TRANSIENT_BUSINESS_CODES = new Set([-102, -107]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function cnipaTransientBusinessCode(value: unknown): number | undefined {
  const container = record(value);
  if (!container) return undefined;
  const rawCode = container.code;
  const code =
    typeof rawCode === "number" && Number.isSafeInteger(rawCode)
      ? rawCode
      : typeof rawCode === "string" && /^-?\d+$/.test(rawCode.trim())
        ? Number(rawCode.trim())
        : undefined;
  return code !== undefined && CNIPA_TRANSIENT_BUSINESS_CODES.has(code) ? code : undefined;
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
  private readonly maxTransientBusinessAttempts: number;
  private readonly transientBusinessRetryBaseDelayMs: number;
  private readonly sleep: (delayMs: number) => Promise<void>;

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
    this.maxTransientBusinessAttempts = boundedInteger(
      options.maxTransientBusinessAttempts,
      3,
      1,
      5,
      "maxTransientBusinessAttempts",
    );
    this.transientBusinessRetryBaseDelayMs = boundedInteger(
      options.transientBusinessRetryBaseDelayMs,
      250,
      0,
      5_000,
      "transientBusinessRetryBaseDelayMs",
    );
    this.sleep =
      options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
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

  private transientBusinessRetryDelayMs(attempt: number): number {
    return Math.min(this.transientBusinessRetryBaseDelayMs * 2 ** (attempt - 1), 2_000);
  }

  private async executeJsonWithTransientBusinessRetry(
    request: CnipaAuthenticatedRequest,
  ): Promise<{ response: CnipaAuthenticatedSessionResponse; value: unknown }> {
    for (let attempt = 1; attempt <= this.maxTransientBusinessAttempts; attempt += 1) {
      const response = await this.execute(request);
      const value = parseCnipaJson(response);
      const transientCode = cnipaTransientBusinessCode(value);
      if (transientCode === undefined) return { response, value };

      if (attempt === this.maxTransientBusinessAttempts) {
        throw new CnipaAcquisitionError(
          "CNIPA_SOURCE_TEMPORARY_FAILURE",
          "CNIPA returned transient business code " +
            transientCode +
            " for " +
            request.documentKind +
            " " +
            request.surface +
            " after " +
            attempt +
            " attempts",
          true,
          response.status,
        );
      }
      await this.sleep(this.transientBusinessRetryDelayMs(attempt));
    }
    throw new CnipaAcquisitionError(
      "CNIPA_SOURCE_TEMPORARY_FAILURE",
      "CNIPA transient business retry loop exhausted unexpectedly",
      true,
    );
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
      "CNIPA normalized detail semantics remain operator-supplied and are not fully authenticated-live-verified",
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
        const { response: listResponse, value: listJson } =
          await this.executeJsonWithTransientBusinessRetry(listRequest);
        evidence.push(cnipaResponseEvidence(listResponse, listRequest));
        const page = this.decoder.decodeList(documentKind, listJson);
        const pageIds = [...new Set(page.sourceRecordIds.map((value) => value.trim()))].filter(
          Boolean,
        );
        const observedBeforePage = sourceRecordIds.size;
        for (const sourceRecordId of pageIds) sourceRecordIds.add(sourceRecordId);
        const newUniqueIds = sourceRecordIds.size - observedBeforePage;

        const authenticatedHiddenPaging =
          normalizedQuery.mode === "DATE_RANGE" &&
          (documentKind === "OPPOSITION_DECISION" ||
            documentKind === "REVIEW_ADJUDICATION");
        if (authenticatedHiddenPaging) {
          // Authenticated raw evidence shows that CNIPA clamps response total/pages/pageIndex
          // to the visible 100-result window while still honoring the requested pageIndex
          // offset. For this verified surface, stop on observed page contents rather than
          // the misleading response pagination metadata.
          if (pageIds.length === 0 || pageIds.length < this.pageSize) break;
          if (newUniqueIds === 0) {
            coverageReasons.add(
              `${documentKind} returned a full hidden page without any new source ids; collection stopped without claiming completeness`,
            );
            break;
          }
          if (pageIndex === this.maxPagesPerLibrary) {
            coverageReasons.add(
              `${documentKind} reached the configured ${this.maxPagesPerLibrary}-page safety ceiling while more hidden pages may exist`,
            );
            break;
          }
          pageIndex += 1;
          continue;
        }

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

      if (normalizedQuery.mode === "DATE_RANGE") {
        coverageReasons.add(
          `${documentKind} date-range bulk acquisition preserves complete LIST response bytes as primary evidence; DETAIL fan-out is intentionally skipped`,
        );
        continue;
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
        const { response: detailResponse, value: detailJson } =
          await this.executeJsonWithTransientBusinessRetry(detailRequest);
        evidence.push(cnipaResponseEvidence(detailResponse, detailRequest, sourceRecordId));
        const decoded = this.decoder.decodeDetail(documentKind, sourceRecordId, detailJson);
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
