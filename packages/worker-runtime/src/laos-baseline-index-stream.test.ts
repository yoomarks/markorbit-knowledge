import { describe, expect, it } from "vitest";
import type { AcquiredCollectionArtifact } from "./artifact-backed-collection-executor";
import {
  buildLaosBaselineIndexPageCommit,
  commitLaosBaselineIndexStream,
  LAOS_BASELINE_INDEX_CHECKPOINT_URI,
  laosIndexResumeFromCheckpoint,
  parseLaosBaselineIndexCheckpoint,
  type LaosBaselineIndexStreamWriter,
} from "./laos-baseline-index-stream";
import { laosSha256, type LaosIndexPage } from "./laos-wopublish-source-adapter";

const encoder = new TextEncoder();
function page(pageIndex: number, total: number, start = (pageIndex - 1) * 50): LaosIndexPage {
  const count = Math.min(50, total - start);
  const ids = Array.from({ length: count }, (_, index) => "LA" + String(20000 + start + index));
  const body = encoder.encode('<page n="' + pageIndex + '">' + ids.join(",") + "</page>");
  return {
    kind: "PAGE",
    page: pageIndex,
    ids,
    total,
    firstPageIdsSha256: laosSha256(encoder.encode(ids.join("\n"))),
    sourceRecordIdsSha256: laosSha256(encoder.encode(ids.join("\n"))),
    rawSha256: laosSha256(body),
    redactedBody: body,
    mime: pageIndex === 1 ? "text/html" : "text/xml",
    observedAt: "2026-09-29T14:00:00.000Z",
    sourceUri: "https://online.dip.gov.la/wopublish-search/public/trademarks?0",
  };
}

class FakeWriter implements LaosBaselineIndexStreamWriter {
  readonly artifacts: AcquiredCollectionArtifact[] = [];
  retained: readonly string[] = [];
  async write(artifact: AcquiredCollectionArtifact) {
    this.artifacts.push(artifact);
    return {
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: artifact.canonicalUri!,
      contentSha256: laosSha256(artifact.content),
      sizeBytes: artifact.content.byteLength,
      reused: false,
      receipt: {
        id: "air_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        contentSha256: laosSha256(artifact.content),
        sizeBytes: artifact.content.byteLength,
      } as never,
    };
  }
  retainCanonicalUris(values: readonly string[]) {
    this.retained = [...values];
  }
}

async function* generated(pages: readonly LaosIndexPage[]) {
  for (const value of pages) yield value;
  const total = pages[0]?.total ?? 0;
  return { sourceTotal: total, uniqueIds: total };
}

describe("Lao full-index durable streaming checkpoints", () => {
  it("materializes page evidence and an exact durable resume checkpoint", () => {
    const first = buildLaosBaselineIndexPageCommit({
      page: page(1, 101),
      committedPageIdsSha256: [],
    });
    expect(first.pageArtifacts[0]?.canonicalUri).toContain("/list/page/1/redacted-response");
    expect(first.pageArtifacts).toHaveLength(4);
    expect(first.pageArtifacts[1]?.parentCanonicalUris).toEqual([
      first.pageArtifacts[0]?.canonicalUri,
    ]);
    expect(first.checkpointArtifact.canonicalUri).toBe(LAOS_BASELINE_INDEX_CHECKPOINT_URI);
    expect(first.checkpoint.completedPage).toBe(1);
    expect(first.checkpoint.requiredPages).toBe(3);
    expect(first.checkpoint.committedUniqueCount).toBe(50);
    expect(first.checkpoint.complete).toBe(false);
    const parsed = parseLaosBaselineIndexCheckpoint(first.checkpointArtifact);
    expect(parsed).toEqual(first.checkpoint);
    expect(laosIndexResumeFromCheckpoint(parsed)).toEqual({
      sourceTotal: 101,
      committedPageIdsSha256: [...first.checkpoint.committedPageIdsSha256],
    });
  });

  it("commits raw, projection, then checkpoint before requesting the next page", async () => {
    const writer = new FakeWriter();
    const result = await commitLaosBaselineIndexStream({
      pages: generated([page(1, 101), page(2, 101), page(3, 101)]),
      writer,
    });
    expect(writer.artifacts).toHaveLength(15);
    expect(writer.artifacts.map((item) => item.canonicalUri)).toEqual([
      "la-dipo://wopublish/trademarks/list/page/1/redacted-response",
      "la-dipo://wopublish/trademarks/list/page/1/source-id-projection",
      "la-dipo://wopublish/trademarks/list/page/1/resume-checkpoint",
      "la-dipo://wopublish/trademarks/list/page/1/fact-admission-request",
      LAOS_BASELINE_INDEX_CHECKPOINT_URI,
      "la-dipo://wopublish/trademarks/list/page/2/redacted-response",
      "la-dipo://wopublish/trademarks/list/page/2/source-id-projection",
      "la-dipo://wopublish/trademarks/list/page/2/resume-checkpoint",
      "la-dipo://wopublish/trademarks/list/page/2/fact-admission-request",
      LAOS_BASELINE_INDEX_CHECKPOINT_URI,
      "la-dipo://wopublish/trademarks/list/page/3/redacted-response",
      "la-dipo://wopublish/trademarks/list/page/3/source-id-projection",
      "la-dipo://wopublish/trademarks/list/page/3/resume-checkpoint",
      "la-dipo://wopublish/trademarks/list/page/3/fact-admission-request",
      LAOS_BASELINE_INDEX_CHECKPOINT_URI,
    ]);
    expect(result.checkpoint.complete).toBe(true);
    expect(result.checkpoint.committedPageIdsSha256).toHaveLength(3);
    expect(result.checkpoint.committedUniqueCount).toBe(101);
    expect(writer.retained).toEqual([LAOS_BASELINE_INDEX_CHECKPOINT_URI]);
  });

  it("resumes from only the last durable checkpoint without replaying committed pages", async () => {
    const first = buildLaosBaselineIndexPageCommit({
      page: page(1, 101),
      committedPageIdsSha256: [],
    });
    const writer = new FakeWriter();
    const result = await commitLaosBaselineIndexStream({
      pages: generated([page(2, 101), page(3, 101)]),
      writer,
      resume: first.checkpoint,
    });
    expect(writer.artifacts[0]?.canonicalUri).toContain("/list/page/2/");
    expect(result.checkpoint.completedPage).toBe(3);
    expect(result.checkpoint.complete).toBe(true);
  });
  it("fails closed on tampered checkpoint and incomplete terminal stream", async () => {
    const first = buildLaosBaselineIndexPageCommit({
      page: page(1, 101),
      committedPageIdsSha256: [],
    });
    const parsed = JSON.parse(new TextDecoder().decode(first.checkpointArtifact.content));
    parsed.committedPageIdsSha256 = ["0".repeat(64), "1".repeat(64)];
    const tampered = {
      ...first.checkpointArtifact,
      content: encoder.encode(JSON.stringify(parsed)),
    };
    expect(() => parseLaosBaselineIndexCheckpoint(tampered)).toThrow(/inconsistent/);

    const writer = new FakeWriter();
    await expect(
      commitLaosBaselineIndexStream({
        pages: generated([page(1, 101)]),
        writer,
      }),
    ).rejects.toThrow(/complete durable checkpoint/);
  });

  it("rejects page skips and a forged current page digest", () => {
    const first = page(1, 101);
    expect(() =>
      buildLaosBaselineIndexPageCommit({
        page: page(3, 101),
        committedPageIdsSha256: [first.sourceRecordIdsSha256],
      }),
    ).toThrow(/resume boundary/);
    const forged = { ...page(2, 101), sourceRecordIdsSha256: "0".repeat(64) };
    expect(() =>
      buildLaosBaselineIndexPageCommit({
        page: forged,
        committedPageIdsSha256: [first.sourceRecordIdsSha256],
      }),
    ).toThrow(/bounded|digest|resume boundary/);
  });
});
