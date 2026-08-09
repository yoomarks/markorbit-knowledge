import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isDocumentIndexV1 } from "@markorbit/contracts";
import { buildCanonicalDocumentIndex } from "../src/canonical-document-indexer";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function input(markdown: string, languages = ["en"]) {
  const content = bytes(markdown);
  return {
    workspaceId: "wsp_01H00000000000000000000000",
    stagingDocumentId: "std_01H00000000000000000000000",
    documentId: "doc-uspto-maintenance",
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    conversionRunId: "cvr_01H00000000000000000000000",
    contentSha256: sha256(content),
    declaredLanguages: languages,
    markdown: content,
  };
}

const canonical = `---
markorbit:
  schemaVersion: "1.0"
  documentId: "doc-uspto-maintenance"
---

# Maintaining your registration

Trademark owners must file maintenance documents to keep a registration active.
See [official guidance](https://www.uspto.gov/trademarks/maintain) for current instructions.

## Filing information

The filing information describes the available maintenance forms and supporting material.

## Evidence

Evidence examples appear in the source document.
`;

describe("canonical document indexer", () => {
  it("builds a deterministic provenance-bound retrieval index", () => {
    const first = buildCanonicalDocumentIndex(input(canonical));
    const second = buildCanonicalDocumentIndex(input(canonical));

    expect(first).toEqual(second);
    expect(isDocumentIndexV1(first)).toBe(true);
    expect(first.id).toMatch(/^dix_[a-f0-9]{40}$/);
    expect(first.languageHint).toEqual({ code: "en", basis: "DECLARED_SINGLE" });
    expect(first.statistics.headingCount).toBe(3);
    expect(first.statistics.linkCount).toBe(1);
    expect(first.keywords).toContain("maintenance");
    expect(first.chunks.length).toBeGreaterThanOrEqual(3);
    expect(first.chunks[0]?.headingPath).toEqual(["Maintaining your registration"]);
    expect(first.chunks.some((chunk) => chunk.headingPath.includes("Filing information"))).toBe(
      true,
    );
    expect(first.chunks.every((chunk, ordinal) => chunk.ordinal === ordinal)).toBe(true);
    expect(first.chunks.every((chunk) => chunk.startLine >= 7)).toBe(true);
    expect(first.chunks.every((chunk) => chunk.contentSha256.length === 64)).toBe(true);
  });

  it("chunks long content without crossing the configured size target", () => {
    const paragraph = Array.from({ length: 150 }, (_, index) => `term${index}`).join(" ");
    const markdown = `---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n# Large section\n\n${paragraph}\n`;
    const index = buildCanonicalDocumentIndex({ ...input(markdown), maxCharacters: 400 });

    expect(index.chunks.length).toBeGreaterThan(1);
    expect(index.chunks.every((chunk) => chunk.characterCount <= 400)).toBe(true);
    expect(index.chunking.maxCharacters).toBe(400);
  });

  it("uses bounded script heuristics only when declarations are ambiguous", () => {
    const markdown = `---\nmarkorbit:\n  schemaVersion: "1.0"\n---\n\n# 更新情報\n\n商標登録の更新について説明します。手続の詳細情報です。\n`;
    const index = buildCanonicalDocumentIndex(input(markdown, ["en", "ja"]));

    expect(index.languageHint).toEqual({ code: "ja", basis: "SCRIPT_HEURISTIC" });
    expect(index.keywords.length).toBeGreaterThan(0);
  });

  it("fails closed when immutable content evidence does not match", () => {
    const changed = input(canonical);
    changed.contentSha256 = "f".repeat(64);
    expect(() => buildCanonicalDocumentIndex(changed)).toThrow(
      "DOCUMENT_INDEX_CONTENT_DIGEST_MISMATCH",
    );
  });
});
