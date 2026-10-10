import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawArtifact } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import {
  parseUsptoIdManualHtml,
  writeUsptoIdManualSnapshot,
} from "../src/uspto-id-manual-snapshot";

const HEADER =
  "<th>Term ID</th><th>Class</th><th>Description</th><th>Status</th><th>Start Effective Date</th><th>Type</th><th>Notes</th><th>TM5</th><th>NCL Version</th>";

function sourceHtml(): Uint8Array {
  const html = `<html><head><meta charset="UTF-8"></head><body>
    <table>${HEADER}<tr><td>001-1</td><td>001</td><td>Alpha &amp; beta</td><td>A</td><td>01/02/2026</td><td>GOODS</td><td></td><td>T</td><td>"13-2026"</td></tr></table>
    <table><tr><td>038-406</td><td>A</td><td>Membership service</td><td>D</td><td>02/03/2025</td><td>SERVICE</td><td>Deleted note</td><td></td><td>"12-2025"</td></tr><tr><td>038-406</td><td>B</td><td>Membership services</td><td>D</td><td>04/05/2025</td><td>SERVICES</td><td>Later note</td><td></td><td>"12-2025"</td></tr></table>
    <table></table></body></html>`;
  return new TextEncoder().encode(html);
}

function artifact(bytes: Uint8Array): RawArtifact {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: "art_01K00000000000000000000000",
    workspaceId: "wsp_01K00000000000000000000000",
    sourceId: "src_01K00000000000000000000000",
    version: 1,
    artifactKind: "HTML",
    mimeType: "text/html",
    originalName: "idmanual.xls",
    storage: { provider: "LOCAL", uri: `artifact+local://sha256/${checksum}` },
    binaryHash: { algorithm: "SHA-256", value: checksum },
    sizeBytes: bytes.byteLength,
    capturedAt: "2026-10-11T00:00:00.000Z",
    collector: { connectorId: "builtin-manual-upload", connectorVersion: "1.0.0" },
    provenance: { sourceUri: "https://idm-tmng.uspto.gov/" },
    status: "READY_FOR_CONVERSION",
    createdAt: "2026-10-11T00:00:00.000Z",
  };
}

describe("USPTO ID Manual HTML snapshot", () => {
  it("reads every table, preserves duplicate Term IDs, and normalizes derived fields", () => {
    const parsed = parseUsptoIdManualHtml(sourceHtml());

    expect(parsed.tableCount).toBe(3);
    expect(parsed.nonEmptyTableCount).toBe(2);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      ordinal: 1,
      description: "Alpha & beta",
      startEffectiveDateRaw: "01/02/2026",
      startEffectiveDate: "2026-01-02",
      tm5: true,
      nclVersionRaw: '"13-2026"',
      nclVersion: "13-2026",
    });
    expect(parsed.rows[1]).toMatchObject({ typeRaw: "SERVICE", typeNormalized: "SERVICES" });
    expect(parsed.distinctTermIdCount).toBe(2);
    expect(parsed.duplicateTermIdCount).toBe(1);
    expect(parsed.statusCounts).toEqual({ A: 1, M: 0, X: 0, D: 2 });
  });

  it("writes and idempotently replays a hash-bound snapshot package", async () => {
    const bytes = sourceHtml();
    const outputRoot = await mkdtemp(join(tmpdir(), "uspto-id-manual-"));
    const first = await writeUsptoIdManualSnapshot({
      bytes,
      rawArtifact: artifact(bytes),
      outputRoot,
      sourceUri: "https://idm-tmng.uspto.gov/",
      expectedRowCount: 3,
      clock: () => new Date("2026-10-11T01:00:00.000Z"),
    });
    const replay = await writeUsptoIdManualSnapshot({
      bytes,
      rawArtifact: artifact(bytes),
      outputRoot,
      sourceUri: "https://idm-tmng.uspto.gov/",
      expectedRowCount: 3,
    });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(first.manifest.rows.count).toBe(3);
    expect(first.manifest.validation.cellCount).toBe(27);
    expect((await readFile(first.rowsPath, "utf8")).trim().split("\n")).toHaveLength(3);
  });

  it("fails closed when a later table has the wrong schema", () => {
    const text = new TextDecoder()
      .decode(sourceHtml())
      .replace(`<table><tr><td>038-406</td>`, `<table><th>Wrong</th><tr><td>038-406</td>`);
    expect(() => parseUsptoIdManualHtml(new TextEncoder().encode(text))).toThrow(
      "unexpected header",
    );
  });
});
