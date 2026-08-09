import type { ConverterRegistryRepository } from "@markorbit/persistence/converters";

const M3_CONVERTERS = [
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
] as const;

export function ensureM3CanonicalDocumentConverters(registry: ConverterRegistryRepository): void {
  for (const manifest of M3_CONVERTERS) {
    if (registry.getManifest(manifest.converterId, manifest.version)) continue;
    registry.createManifest({
      ...manifest,
      capabilities: [...manifest.capabilities],
      inputs: {
        artifactKinds: [...manifest.inputs.artifactKinds],
        mimePatterns: [...manifest.inputs.mimePatterns],
      },
      configurationSchema: JSON.parse(JSON.stringify(manifest.configurationSchema)) as Record<
        string,
        never
      >,
      resourceHints: { ...manifest.resourceHints },
    });
  }
}
