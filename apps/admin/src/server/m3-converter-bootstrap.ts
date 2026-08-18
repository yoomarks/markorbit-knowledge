import type {
  ConverterRegistryRepository,
  CreateConversionProfileInput,
  CreateConverterManifestInput,
} from "@markorbit/persistence/converters";

const M3_CONVERTERS: CreateConverterManifestInput[] = [
  {
    converterId: "builtin-markdown-staging",
    displayName: "Built-in canonical Markdown staging",
    version: "1.0.0",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "EXTRACT_METADATA"],
    inputs: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
    outputFormat: "MARKDOWN",
    deterministic: true,
    configurationSchema: { type: "object", properties: {}, additionalProperties: false },
    resourceHints: { maxInputBytes: 4_500_000, timeoutSeconds: 30 },
    status: "ACTIVE",
  },
  {
    converterId: "builtin-html-markdown",
    displayName: "Built-in HTML to Markdown",
    version: "1.0.0",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "EXTRACT_METADATA", "PRESERVE_LINKS"],
    inputs: { artifactKinds: ["HTML"], mimePatterns: ["text/html", "application/xhtml+xml"] },
    outputFormat: "MARKDOWN",
    deterministic: true,
    configurationSchema: {
      type: "object",
      properties: { preserveLinks: { type: "boolean" } },
      additionalProperties: false,
    },
    resourceHints: { maxInputBytes: 12_000_000, timeoutSeconds: 30 },
    status: "ACTIVE",
  },
  {
    converterId: "builtin-pdf-markdown",
    displayName: "Built-in PDF text-layer to Markdown",
    version: "1.0.0",
    runtime: "BUILT_IN",
    capabilities: ["CONVERT", "EXTRACT_METADATA"],
    inputs: { artifactKinds: ["PDF"], mimePatterns: ["application/pdf"] },
    outputFormat: "MARKDOWN",
    deterministic: true,
    configurationSchema: { type: "object", properties: {}, additionalProperties: false },
    resourceHints: { maxInputBytes: 12_000_000, timeoutSeconds: 60 },
    status: "ACTIVE",
  },
  {
    converterId: "local-rich-document-markdown",
    displayName: "Local rich document to Markdown extraction",
    version: "1.0.0",
    runtime: "LOCAL_PROCESS",
    capabilities: ["CONVERT", "PRESERVE_TABLES"],
    inputs: {
      artifactKinds: ["DOCX", "XLSX", "CSV", "JSON", "XML", "EMAIL", "TEXT"],
      mimePatterns: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "application/csv",
        "application/json",
        "text/json",
        "application/xml",
        "text/xml",
        "message/rfc822",
        "text/plain",
      ],
    },
    outputFormat: "MARKDOWN",
    deterministic: true,
    configurationSchema: { type: "object", properties: {}, additionalProperties: false },
    resourceHints: { maxInputBytes: 25_000_000, timeoutSeconds: 60 },
    status: "ACTIVE",
  },
  {
    converterId: "local-ocr-markdown",
    displayName: "Local OCR to Markdown extraction",
    version: "1.0.0",
    runtime: "LOCAL_PROCESS",
    capabilities: ["CONVERT"],
    inputs: { artifactKinds: ["PDF", "IMAGE"], mimePatterns: ["application/pdf", "image/*"] },
    outputFormat: "MARKDOWN",
    deterministic: false,
    configurationSchema: { type: "object", properties: {}, additionalProperties: false },
    resourceHints: { maxInputBytes: 25_000_000, timeoutSeconds: 180 },
    status: "ACTIVE",
  },
];

const CANONICAL_AUTO_PROFILE_SPECS = [
  {
    name: "Canonical Markdown auto staging",
    converterId: "builtin-markdown-staging",
    artifactKinds: ["MARKDOWN"] as const,
    mimePatterns: ["text/markdown"],
    configuration: {},
  },
  {
    name: "Canonical HTML auto conversion",
    converterId: "builtin-html-markdown",
    artifactKinds: ["HTML"] as const,
    mimePatterns: ["text/html", "application/xhtml+xml"],
    configuration: { preserveLinks: true },
  },
  {
    name: "Canonical PDF auto conversion",
    converterId: "builtin-pdf-markdown",
    artifactKinds: ["PDF"] as const,
    mimePatterns: ["application/pdf"],
    configuration: {},
  },
  {
    name: "Canonical rich document auto conversion",
    converterId: "local-rich-document-markdown",
    artifactKinds: ["DOCX", "XLSX", "CSV", "JSON", "XML", "EMAIL", "TEXT"] as const,
    mimePatterns: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/csv",
      "application/json",
      "text/json",
      "application/xml",
      "text/xml",
      "message/rfc822",
      "text/plain",
    ],
    configuration: {},
  },
] as const;

export function ensureM3CanonicalDocumentConverters(registry: ConverterRegistryRepository): void {
  for (const manifest of M3_CONVERTERS) {
    if (registry.getManifest(manifest.converterId, manifest.version)) continue;
    registry.createManifest(manifest);
  }
}

/**
 * Ensure a low-precedence workspace fallback for deterministic canonical document conversion.
 *
 * Source-scoped profiles still win in automatic selection, followed by higher precedence custom
 * workspace profiles. OCR is deliberately excluded: image/scanned-document conversion requires an
 * explicit policy decision instead of silently becoming a default ingestion cost/quality tradeoff.
 */
export function ensureM3CanonicalDocumentAutoProfiles(
  registry: ConverterRegistryRepository,
  workspaceId: string,
): void {
  ensureM3CanonicalDocumentConverters(registry);

  for (const spec of CANONICAL_AUTO_PROFILE_SPECS) {
    const existing = registry
      .listProfiles({ workspaceId, q: spec.name, limit: 100 })
      .items.find((profile) => profile.name === spec.name);
    if (existing) continue;

    const profile: CreateConversionProfileInput = {
      workspaceId,
      name: spec.name,
      status: "ACTIVE",
      converter: { converterId: spec.converterId, version: "1.0.0" },
      input: {
        artifactKinds: [...spec.artifactKinds],
        mimePatterns: [...spec.mimePatterns],
      },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "canonical/{artifactId}.md",
      configuration: { ...spec.configuration },
      precedence: 0,
      autoConvert: true,
    };
    registry.createProfile(profile);
  }
}
