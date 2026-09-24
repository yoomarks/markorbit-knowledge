import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  LAOS_SOURCE_ID,
  LaosWopublishSourceAdapter,
  type LaosHttpRequest,
  type LaosHttpResponse,
  type LaosHttpTransport,
  type LaosPage,
  type LaosDetail,
} from "@markorbit/worker-runtime";
import { LaosPlaywrightTransport } from "./laos-playwright-transport";

const enabled = process.env.MARKORBIT_LA_LIVE_BOUNDED_PILOT === "1";
const digest = (body: Uint8Array) => createHash("sha256").update(body).digest("hex");
const safePath = (value: string): string => {
  const url = new URL(value);
  if (url.hostname !== "online.dip.gov.la" || url.protocol !== "https:") {
    throw new Error("Live pilot observed an unexpected origin");
  }
  // Only static route names and the bounded source id are emitted; never log Wicket
  // query callbacks, JSESSIONID, psusr, request headers or cookie values.
  if (url.pathname.includes("/public/detail/trademarks")) return "DETAIL";
  if (url.pathname.endsWith("/logo")) return "LOGO";
  return url.search.includes("navigator-next") ? "WICKET_NEXT" : "LIST";
};
type NetworkProof = {
  route: string;
  method: "GET";
  requestHeaderNames: string[];
  httpStatus: number;
  contentType: string;
  responseSha256: string;
  observedAt: string;
};
class RecordedLaosTransport implements LaosHttpTransport {
  private readonly underlying = new LaosPlaywrightTransport(
    process.env.MARKORBIT_LA_BROWSER_EXECUTABLE_PATH,
  );
  constructor(private readonly proofs: NetworkProof[]) {}
  async get(request: LaosHttpRequest): Promise<LaosHttpResponse> {
    const response = await this.underlying.get(request);
    this.proofs.push({
      route: safePath(request.url),
      method: "GET",
      requestHeaderNames: Object.keys(request.headers)
        .map((key) => key.toLowerCase())
        .sort(),
      httpStatus: response.status,
      contentType: response.contentType,
      responseSha256: digest(response.body),
      observedAt: response.observedAt,
    });
    return response;
  }
  async close(): Promise<void> {
    await this.underlying.close();
  }
}
it.skipIf(!enabled)(
  "runs only the explicit 2-page + one-detail official browser-network pilot",
  async () => {
    const output = process.env.MARKORBIT_LA_LIVE_PROOF_DIR;
    if (!output || !process.env.MARKORBIT_LA_BROWSER_EXECUTABLE_PATH) {
      throw new Error("Bounded pilot requires explicit browser executable and proof directory");
    }
    const network: NetworkProof[] = [];
    const adapter = new LaosWopublishSourceAdapter({
      transportFactory: () => new RecordedLaosTransport(network),
      intervalMs: 1_250,
    });
    const firstResult = await adapter.fetch({
      sourceId: LAOS_SOURCE_ID,
      params: { mode: "PAGE" },
    });
    const first = firstResult.items[0] as LaosPage;
    expect(first.kind).toBe("PAGE");
    expect(first.page).toBe(1);
    expect(first.ids).toHaveLength(50);
    const secondResult = await adapter.fetch({
      sourceId: LAOS_SOURCE_ID,
      cursor: "2",
      params: {
        mode: "PAGE",
        expectedFirstPageIdsSha256: first.firstPageIdsSha256,
        expectedSourceTotal: String(first.total),
      },
    });
    const second = secondResult.items[0] as LaosPage;
    expect(second.kind).toBe("PAGE");
    expect(second.page).toBe(2);
    expect(second.ids).toHaveLength(50);
    expect(second.firstPageIdsSha256).toBe(first.firstPageIdsSha256);
    expect(second.total).toBe(first.total);
    const overlap = second.ids.filter((id) => first.ids.includes(id));
    expect(overlap).toHaveLength(0);
    const detailResult = await adapter.fetch({
      sourceId: LAOS_SOURCE_ID,
      params: { mode: "DETAIL", sourceRecordId: "LA55159" },
    });
    const detail = detailResult.items[0] as LaosDetail;
    expect(detail.id).toBe("LA55159");
    expect(detail.status).toBeTruthy();
    expect(detail.applicant).toBeTruthy();
    expect(detail.niceClasses.length).toBeGreaterThan(0);
    const content = {
      schemaVersion: "LA_WOPUBLISH_BOUNDED_BROWSER_NETWORK_PROOF_V1",
      sourceOwner: "MARKORBIT_KNOWLEDGE",
      fixture: false,
      result: "BOUNDED_BROWSER_NETWORK_OBSERVATION_ONLY",
      sourceId: LAOS_SOURCE_ID,
      pageCounts: [first.ids.length, second.ids.length],
      uniqueIds: new Set([...first.ids, ...second.ids]).size,
      sourceTotal: first.total,
      firstPageIdsSha256: first.firstPageIdsSha256,
      overlap: overlap.length,
      sourceResponseSha256: [first.rawSha256, second.rawSha256, detail.rawSha256],
      redactedEvidenceSha256: [
        digest(first.redactedBody),
        digest(second.redactedBody),
        digest(detail.redactedBody),
      ],
      detailId: detail.id,
      detailFilingDate: detail.filingDate,
      detailNiceClasses: detail.niceClasses,
      logoUrlObserved: Boolean(detail.logoUrl),
      logoBytesCaptured: Boolean(detail.logoBytes),
      network,
      fullCollectionAuthorized: false,
      dataEngineWriteClaimed: false,
    };
    if (content.uniqueIds !== 100) throw new Error("Pilot did not capture 100 unique source IDs");
    await mkdir(output, { recursive: true });
    const proofFile = join(output, "la-wopublish-bounded-network-proof.json");
    await writeFile(proofFile, JSON.stringify(content, null, 2) + "\n", { flag: "wx" });
    // Only sanitized source responses are exported for a separately authorized
    // Knowledge RawArtifact ingestion. Do not export browser sessions or raw HAR.
    await writeFile(join(output, "la-wopublish-page-1-redacted.html"), first.redactedBody, {
      flag: "wx",
    });
    await writeFile(join(output, "la-wopublish-page-2-redacted.xml"), second.redactedBody, {
      flag: "wx",
    });
    await writeFile(
      join(output, "la-wopublish-detail-LA55159-redacted.html"),
      detail.redactedBody,
      { flag: "wx" },
    );
    expect(network.map((record) => record.route)).toEqual([
      "LIST",
      "LIST",
      "WICKET_NEXT",
      "DETAIL",
      "LOGO",
    ]);
  },
  180_000,
);
