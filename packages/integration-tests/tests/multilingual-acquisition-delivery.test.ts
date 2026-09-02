import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportEvidenceBundle } from "../src/evidence-bundle";
import { runManualFixturePipeline } from "../src/manual-fixture-runner";
import {
  consumeReadyPackageToVault,
  verifyVaultConsumption,
} from "../src/obsidian-vault-consumer";
import { prepareReadyPackage } from "../src/ready-package";
import { writeRunEvidenceManifest } from "../src/run-evidence-manifest";

const roots: string[] = [];
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

const fixtures = [
  {
    language: "pt",
    text: "Pedido de marca: ação, proteção, órgão competente e São Paulo.\n",
  },
  {
    language: "es",
    text: "Solicitud de marca: protección, clasificación, año y resolución.\n",
  },
  {
    language: "ja",
    text: "商標登録出願の審査結果と指定商品を確認します。\n",
  },
  {
    language: "ko",
    text: "상표등록출원의 심사 결과와 지정상품을 확인합니다.\n",
  },
  {
    language: "ar",
    text: "نراجع نتيجة فحص طلب تسجيل العلامة التجارية والسلع المحددة.\n",
  },
] as const;

function directory(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  roots.push(value);
  return value;
}

function filesRecursively(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesRecursively(path) : [path];
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("multilingual acquisition, staging, and delivery", () => {
  it.each(fixtures)("preserves $language UTF-8 bytes across the offline pipeline", async (fixture) => {
    const sourceRoot = directory(`markorbit-multilingual-${fixture.language}-`);
    const inputPath = join(sourceRoot, `${fixture.language}.txt`);
    const outputRoot = join(sourceRoot, "output");
    const inputBytes = Buffer.from(fixture.text, "utf8");
    writeFileSync(inputPath, inputBytes);

    const summary = await runManualFixturePipeline({
      inputPath,
      outputDirectory: outputRoot,
      executionKey: `multilingual-${fixture.language}`,
      clock: () => new Date("2026-09-02T01:00:00.000Z"),
    });

    expect(summary.status).toBe("COMPLETED");
    expect(summary.verificationOutcome).toBe("PASS");
    expect(summary.input.sizeBytes).toBe(inputBytes.byteLength);
    expect(summary.input.sha256).toBe(sha256(inputBytes));

    const rawFiles = filesRecursively(join(outputRoot, "raw-artifacts"));
    const rawPayloads = rawFiles.map((path) => readFileSync(path));
    expect(rawPayloads.some((payload) => payload.equals(inputBytes))).toBe(true);

    const stagedPath = join(
      summary.output.casDirectory,
      summary.output.sha256.slice(0, 2),
      summary.output.sha256,
    );
    const stagedBytes = readFileSync(stagedPath);
    expect(stagedBytes.equals(inputBytes)).toBe(true);
    expect(stagedBytes.toString("utf8")).toBe(fixture.text);
    expect(summary.output.sizeBytes).toBe(inputBytes.byteLength);
    expect(summary.output.sha256).toBe(sha256(inputBytes));

    writeRunEvidenceManifest(outputRoot, {
      generatedAt: "2026-09-02T01:01:00.000Z",
      executionKey: `multilingual-${fixture.language}`,
      workspaceId: summary.workspaceId,
      sourceId: `src_multilingual_${fixture.language}`,
      rawArtifact: {
        id: `raw_multilingual_${fixture.language}`,
        status: "READY_FOR_CONVERSION",
        artifactKind: "TEXT",
        mimeType: "text/plain",
        sizeBytes: inputBytes.byteLength,
        sha256: sha256(inputBytes),
      },
      conversion: {
        runId: summary.conversionRunId,
        runStatus: "COMPLETED",
        attemptId: `attempt_multilingual_${fixture.language}`,
        attemptStatus: "OUTPUT_REPORTED",
        leaseId: `lease_multilingual_${fixture.language}`,
        leaseStatus: "RELEASED",
        converterId: "builtin-text-markdown",
        converterVersion: "1.0.0",
      },
      staging: {
        documentId: summary.stagingDocumentId,
        status: "READY",
        targetPath: summary.output.targetPath,
        sizeBytes: stagedBytes.byteLength,
        sha256: sha256(stagedBytes),
      },
      verification: {
        id: `verification_multilingual_${fixture.language}`,
        verifierId: "builtin-staging-verifier",
        verifierVersion: "1.0.0",
        outcome: "PASS",
        checks: 15,
        warnings: 0,
      },
      terminal: { status: "COMPLETED", observedPhase: "COMPLETED" },
      files: {
        databasePath: summary.output.databasePath,
        casDirectory: summary.output.casDirectory,
      },
    });
    exportEvidenceBundle(outputRoot, "2026-09-02T01:02:00.000Z");
    const ready = prepareReadyPackage(outputRoot, "2026-09-02T01:03:00.000Z");
    expect(ready.manifest.stagingSha256).toBe(sha256(stagedBytes));

    const vault = directory(`markorbit-multilingual-vault-${fixture.language}-`);
    const consumed = consumeReadyPackageToVault(
      outputRoot,
      vault,
      "2026-09-02T01:04:00.000Z",
    );
    const vaultBytes = readFileSync(join(vault, summary.output.targetPath));
    expect(vaultBytes.equals(stagedBytes)).toBe(true);
    expect(vaultBytes.toString("utf8")).toBe(fixture.text);
    expect(verifyVaultConsumption(outputRoot, vault).packageId).toBe(consumed.packageId);

    const replay = consumeReadyPackageToVault(
      outputRoot,
      vault,
      "2026-09-02T01:05:00.000Z",
    );
    expect(replay.status).toBe("REPLAYED");
    expect(readFileSync(join(vault, summary.output.targetPath)).equals(stagedBytes)).toBe(true);
  }, 20_000);
});
