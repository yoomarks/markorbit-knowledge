import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalEvidenceBundle } from "../src/evidence-bundle";
import { runManualFixturePipelineWithManifest } from "../src/manual-fixture-manifest-runner";
import {
  consumeReadyPackageToVault,
  verifyVaultConsumption,
} from "../src/obsidian-vault-consumer";
import { prepareReadyPackage } from "../src/ready-package";

const directories: string[] = [];
const fixedClock = () => new Date("2026-09-02T00:00:00.000Z");

const fixtures = [
  {
    language: "pt",
    text: "Pedido de marca — café, ação, informação. Marcador: órbita-portuguesa.\n",
  },
  {
    language: "es",
    text: "Solicitud de marca — café, acción, información. Marcador: órbita-española.\n",
  },
  {
    language: "ja",
    text: "商標出願の原文をそのまま保存します。識別子：軌道-日本語。\n",
  },
  {
    language: "ko",
    text: "상표 출원의 원문을 그대로 보존합니다. 식별자: 궤도-한국어.\n",
  },
  {
    language: "ar",
    text: "يتم حفظ النص الأصلي لطلب العلامة التجارية كما هو. المعرّف: مدار-العربية.\n",
  },
] as const;

function directory(prefix: string): string {
  const value = mkdtempSync(join(tmpdir(), prefix));
  directories.push(value);
  return value;
}

function readBundle(path: string): LocalEvidenceBundle {
  return JSON.parse(readFileSync(path, "utf8")) as LocalEvidenceBundle;
}

afterEach(() => {
  for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("K-MULTI-001 multilingual acquisition, staging, and delivery", () => {
  it.each(fixtures)(
    "preserves $language UTF-8 from immutable RawArtifact through ReadyPackage delivery",
    async ({ language, text }) => {
      const inputDirectory = directory(`markorbit-multi-${language}-input-`);
      const outputDirectory = directory(`markorbit-multi-${language}-output-`);
      const vaultDirectory = directory(`markorbit-multi-${language}-vault-`);
      const inputPath = join(inputDirectory, `${language}.txt`);
      const inputBytes = Buffer.from(text, "utf8");
      writeFileSync(inputPath, inputBytes);

      const summary = await runManualFixturePipelineWithManifest({
        inputPath,
        outputDirectory,
        executionKey: `k-multi-001-${language}`,
        clock: fixedClock,
      });

      expect(summary.status).toBe("COMPLETED");
      expect(summary.verificationOutcome).toBe("PASS");
      expect(summary.input.sizeBytes).toBe(inputBytes.byteLength);

      const bundle = readBundle(summary.output.evidenceBundlePath);
      const rawEvidence = bundle.files.find(
        (file) =>
          file.role === "RAW_ARTIFACT" &&
          file.sha256 === summary.input.sha256 &&
          file.sizeBytes === inputBytes.byteLength,
      );
      expect(rawEvidence).toBeDefined();
      if (!rawEvidence) throw new Error(`Missing RawArtifact evidence for ${language}`);
      const rawBytes = readFileSync(join(summary.output.rootDirectory, rawEvidence.path));
      expect(Buffer.compare(rawBytes, inputBytes)).toBe(0);

      const stagingEvidence = bundle.files.find(
        (file) => file.role === "STAGING_CAS" && file.sha256 === summary.output.sha256,
      );
      expect(stagingEvidence).toBeDefined();
      if (!stagingEvidence) throw new Error(`Missing staging evidence for ${language}`);
      const stagedBytes = readFileSync(join(summary.output.rootDirectory, stagingEvidence.path));
      const stagedText = stagedBytes.toString("utf8");
      expect(stagedText).toContain(text);
      expect(stagedText.endsWith(text)).toBe(true);

      prepareReadyPackage(summary.output.rootDirectory, "2026-09-02T00:01:00.000Z");
      const consumed = consumeReadyPackageToVault(
        summary.output.rootDirectory,
        vaultDirectory,
        "2026-09-02T00:02:00.000Z",
      );
      expect(consumed.status).toBe("CONSUMED");

      const deliveredBytes = readFileSync(consumed.absoluteTargetPath);
      expect(Buffer.compare(deliveredBytes, stagedBytes)).toBe(0);
      expect(deliveredBytes.toString("utf8")).toContain(text);
      expect(verifyVaultConsumption(summary.output.rootDirectory, vaultDirectory).status).toBe(
        "REPLAYED",
      );
      expect(
        consumeReadyPackageToVault(summary.output.rootDirectory, vaultDirectory).status,
      ).toBe("REPLAYED");
    },
    30_000,
  );
});
