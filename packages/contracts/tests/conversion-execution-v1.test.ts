import { describe, expect, it } from "vitest";
import {
  canTransitionConversionRun,
  forbiddenConversionExecutionField,
  isConversionExecutionEvent,
  isConversionRun,
  isStagingDocumentDescriptor,
  type ConversionExecutionEvent,
  type ConversionRun,
  type StagingDocumentDescriptor,
} from "../src/conversion-execution-v1";
import type { ConversionProfile, ConverterManifest } from "../src/conversion-control-v1";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const sourceId = "src_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const artifactId = "art_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const runId = "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const stagingId = "std_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const hash = "a".repeat(64);

const manifest: ConverterManifest = {
  protocolVersion: "1.0",
  objectType: "CONVERTER_MANIFEST",
  converterId: "builtin-html-markdown",
  displayName: "Built-in HTML to Markdown",
  version: "1.0.0",
  runtime: "BUILT_IN",
  capabilities: ["CONVERT", "PRESERVE_LINKS"],
  inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
  outputFormat: "MARKDOWN",
  deterministic: true,
  configurationSchema: {
    type: "object",
    properties: { preserveLinks: { type: "boolean" } },
    additionalProperties: false,
  },
  resourceHints: { maxInputBytes: 10485760, timeoutSeconds: 30 },
  status: "ACTIVE",
};

const profile: ConversionProfile = {
  protocolVersion: "1.0",
  objectType: "CONVERSION_PROFILE",
  id: "cvp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  workspaceId,
  sourceId,
  name: "Official HTML staging",
  status: "ACTIVE",
  converter: { converterId: manifest.converterId, version: manifest.version },
  input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
  outputFormat: "MARKDOWN",
  targetPathTemplate: "00_Inbox/{sourceSlug}/{artifactId}.md",
  configuration: { preserveLinks: true },
  precedence: 100,
  autoConvert: false,
  createdAt: "2026-07-17T02:00:00Z",
  updatedAt: "2026-07-17T02:00:00Z",
};

const descriptor: StagingDocumentDescriptor = {
  contractVersion: "1.0",
  objectType: "STAGING_DOCUMENT_DESCRIPTOR",
  id: stagingId,
  workspaceId,
  sourceId,
  rawArtifactId: artifactId,
  conversionRunId: runId,
  title: "USPTO weekly update",
  targetPath: "00_Inbox/uspto/artifact.md",
  outputFormat: "MARKDOWN",
  contentHash: { algorithm: "SHA-256", value: hash },
  sizeBytes: 512,
  contentAddressedRef: `cas:sha256:${hash}`,
  frontmatterSummary: {
    fieldCount: 3,
    fields: [
      { key: "title", valueType: "STRING" },
      { key: "source_id", valueType: "STRING" },
      { key: "captured_at", valueType: "DATE" },
    ],
  },
  converter: { converterId: manifest.converterId, version: manifest.version },
  generatedAt: "2026-07-17T02:03:00Z",
  validation: {
    outcome: "PASS_WITH_WARNINGS",
    checks: [
      { code: "MARKDOWN_PRESENT", status: "PASS" },
      { code: "LINK_NORMALIZATION", status: "WARN", message: "One relative link was preserved" },
    ],
    warnings: ["One relative link requires later review"],
  },
  status: "READY",
};

const pendingRun: ConversionRun = {
  contractVersion: "1.0",
  objectType: "CONVERSION_RUN",
  id: runId,
  workspaceId,
  sourceId,
  rawArtifactId: artifactId,
  conversionProfileId: profile.id,
  conversionProfileSnapshot: profile,
  converter: { converterId: manifest.converterId, version: manifest.version },
  converterManifestSnapshot: manifest,
  input: {
    artifactId,
    artifactKind: "HTML",
    mimeType: "text/html",
    sha256: "b".repeat(64),
    sizeBytes: 1024,
  },
  trigger: "MANUAL",
  actor: { type: "ADMIN", id: "admin:reviewer" },
  idempotencyKey: "manual:artifact:01",
  requestedOutput: {
    format: "MARKDOWN",
    targetPathTemplate: profile.targetPathTemplate,
  },
  status: "PENDING",
  createdAt: "2026-07-17T02:01:00Z",
  updatedAt: "2026-07-17T02:01:00Z",
};

const createdEvent: ConversionExecutionEvent = {
  contractVersion: "1.0",
  objectType: "CONVERSION_EXECUTION_EVENT",
  id: "cve_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  runId,
  sequence: 1,
  eventType: "CREATED",
  previousStatus: null,
  resultingStatus: "PENDING",
  occurredAt: "2026-07-17T02:01:00Z",
  actor: { type: "SYSTEM", id: "system" },
};

describe("Conversion Execution Protocol v1", () => {
  it("accepts strict pending, completed and staging output evidence", () => {
    expect(isConversionRun(pendingRun)).toBe(true);
    expect(isStagingDocumentDescriptor(descriptor)).toBe(true);
    expect(
      isConversionRun({
        ...pendingRun,
        status: "COMPLETED",
        startedAt: "2026-07-17T02:02:00Z",
        verifyingAt: "2026-07-17T02:03:00Z",
        completedAt: "2026-07-17T02:04:00Z",
        updatedAt: "2026-07-17T02:04:00Z",
        stagingDocument: descriptor,
      }),
    ).toBe(true);
  });

  it("locks legal lifecycle transitions and terminal states", () => {
    expect(canTransitionConversionRun(null, "PENDING")).toBe(true);
    expect(canTransitionConversionRun("PENDING", "RUNNING")).toBe(true);
    expect(canTransitionConversionRun("PENDING", "CANCELLED")).toBe(true);
    expect(canTransitionConversionRun("RUNNING", "VERIFYING")).toBe(true);
    expect(canTransitionConversionRun("VERIFYING", "COMPLETED")).toBe(true);
    expect(canTransitionConversionRun("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransitionConversionRun("FAILED", "PENDING")).toBe(false);
    expect(canTransitionConversionRun("CANCELLED", "RUNNING")).toBe(false);
  });

  it("requires terminal evidence and cancellation before execution", () => {
    expect(isConversionRun({ ...pendingRun, status: "COMPLETED" })).toBe(false);
    expect(
      isConversionRun({
        ...pendingRun,
        status: "FAILED",
        startedAt: "2026-07-17T02:02:00Z",
        failedAt: "2026-07-17T02:03:00Z",
        updatedAt: "2026-07-17T02:03:00Z",
      }),
    ).toBe(false);
    expect(
      isConversionRun({
        ...pendingRun,
        status: "FAILED",
        startedAt: "2026-07-17T02:02:00Z",
        failedAt: "2026-07-17T02:03:00Z",
        updatedAt: "2026-07-17T02:03:00Z",
        failure: {
          kind: "VERIFICATION_FAILED",
          code: "INVALID_FRONTMATTER",
          message: "Required provenance field is missing",
          retryable: false,
        },
      }),
    ).toBe(true);
    expect(
      isConversionRun({
        ...pendingRun,
        status: "CANCELLED",
        cancelledAt: "2026-07-17T02:02:00Z",
        updatedAt: "2026-07-17T02:02:00Z",
      }),
    ).toBe(true);
    expect(
      isConversionRun({
        ...pendingRun,
        status: "CANCELLED",
        startedAt: "2026-07-17T02:01:30Z",
        cancelledAt: "2026-07-17T02:02:00Z",
        updatedAt: "2026-07-17T02:02:00Z",
      }),
    ).toBe(false);
  });

  it("validates append-only event transitions and event-specific payloads", () => {
    expect(isConversionExecutionEvent(createdEvent)).toBe(true);
    expect(
      isConversionExecutionEvent({
        ...createdEvent,
        id: "cve_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        sequence: 2,
        eventType: "PROGRESS_REPORTED",
        previousStatus: "RUNNING",
        resultingStatus: "RUNNING",
        progress: { percent: 50 },
      }),
    ).toBe(true);
    expect(
      isConversionExecutionEvent({
        ...createdEvent,
        eventType: "COMPLETED",
        previousStatus: "RUNNING",
        resultingStatus: "COMPLETED",
        completion: { stagingDocumentId: stagingId, contentHash: hash, sizeBytes: 512 },
      }),
    ).toBe(false);
    expect(
      isConversionExecutionEvent({
        ...createdEvent,
        eventType: "FAILED",
        previousStatus: "VERIFYING",
        resultingStatus: "FAILED",
      }),
    ).toBe(false);
  });

  it("rejects unknown nested fields, embedded bodies, secrets and executable instructions", () => {
    expect(isConversionRun({ ...pendingRun, unexpected: true })).toBe(false);
    expect(
      isStagingDocumentDescriptor({
        ...descriptor,
        frontmatterSummary: {
          ...descriptor.frontmatterSummary,
          fields: [{ key: "title", valueType: "STRING", rawValue: "hidden" }],
          fieldCount: 1,
        },
      }),
    ).toBe(false);
    expect(isStagingDocumentDescriptor({ ...descriptor, markdown: "# embedded body" })).toBe(false);
    expect(
      isConversionExecutionEvent({
        ...createdEvent,
        failure: {
          kind: "WORKER_ERROR",
          code: "BAD_RUNTIME",
          message: "failed",
          retryable: false,
          details: { "x-debug": { shell: "rm -rf /" } },
        },
      }),
    ).toBe(false);
    expect(forbiddenConversionExecutionField({ nested: { apiToken: "secret" } })).toBe(
      "root.nested.apiToken",
    );
  });

  it("requires exact active snapshots and compatible immutable input evidence", () => {
    expect(
      isConversionRun({
        ...pendingRun,
        converterManifestSnapshot: { ...manifest, version: "2.0.0" },
      }),
    ).toBe(false);
    expect(
      isConversionRun({
        ...pendingRun,
        input: { ...pendingRun.input, mimeType: "application/pdf", artifactKind: "PDF" },
      }),
    ).toBe(false);
    expect(
      isConversionRun({
        ...pendingRun,
        conversionProfileSnapshot: { ...profile, status: "PAUSED" },
      }),
    ).toBe(false);
  });
});
