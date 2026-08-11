# ReadyPackage Content Export V1

Status: **frozen for R1 Knowledge → Core integration**.

## Purpose

ReadyPackage Content Export V1 is the immutable content envelope Knowledge can hand to a downstream Core consumer after a ReadyPackage is verified. It carries canonical Markdown plus the evidence identity needed to prove where that Markdown came from. It does **not** perform understanding, summarization, extraction, classification, or any other semantic/AI work.

The TypeScript source of truth is `packages/contracts/src/ready-package-content-export-v1.ts`.

## Frozen envelope

```ts
{
  contractVersion: "1.0";
  objectType: "READY_PACKAGE_CONTENT_EXPORT";
  readyPackageId: string;
  knowledgeWorkspaceId: string;
  readyPackageDigest: string;
  provenance: {
    sourceId: string;
    conversionRunId: string;
    verificationId: string;
    verificationOutcome: "PASS" | "PASS_WITH_WARNINGS";
    capturedAt: string;
    converter: { converterId: string; version: string };
    legalTruthVerified: false;
  };
  rawArtifact: {
    artifactId: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    originalName: string;
  };
  stagingDocument: {
    documentId: string;
    sha256: string;
    sizeBytes: number;
    mediaType: "text/markdown";
    encoding: "utf-8";
    content: string;
  };
}
```

## Immutability rule

For a given ReadyPackage digest, the serialized V1 export must remain byte-identical. Therefore the envelope deliberately excludes mutable delivery state such as `status`, `handedOffAt`, intake status, retry state, and runtime values such as `exportedAt`.

The exporter revalidates the frozen ReadyPackage digest, raw-artifact metadata and bytes, staging provenance, staging hash/size, and UTF-8 encoding before returning content. Any drift fails closed rather than producing a new representation under the same ReadyPackage identity.

## Content boundary

V1 embeds the canonical staging Markdown because that is the normalized content Core needs to consume. Raw source bytes remain Knowledge-owned evidence and are represented by immutable identity, digest, size, media type, and original name; raw binaries are not duplicated into the JSON export.

This keeps the Knowledge/Core boundary explicit:

- **Knowledge:** acquire, preserve evidence, convert to canonical staging, verify, export.
- **Core:** consume the frozen export and perform understanding/reasoning in a later Core milestone.

## Transport boundary

V1 freezes the content contract and exporter only. It does not invent a new Core → Knowledge authentication protocol or public content endpoint. Transport/authentication for Core consumption must reuse an explicitly agreed internal-service boundary in the Core consumption milestone.
