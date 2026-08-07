import { describe, expect, it } from "vitest";
import collectionPlanFixture from "../../../fixtures/contracts/v1/collection-plan.valid.json";
import connectorManifestFixture from "../../../fixtures/contracts/v1/connector-manifest.valid.json";
import rawArtifactFixture from "../../../fixtures/contracts/v1/raw-artifact.valid.json";
import sourceDefinitionFixture from "../../../fixtures/contracts/v1/source-definition.valid.json";
import workspaceFixture from "../../../fixtures/contracts/v1/workspace.valid.json";
import collectionPlanSchema from "../../../schemas/v1/collection-plan.schema.json";
import connectorManifestSchema from "../../../schemas/v1/connector-manifest.schema.json";
import rawArtifactSchema from "../../../schemas/v1/raw-artifact.schema.json";
import sourceDefinitionSchema from "../../../schemas/v1/source-definition.schema.json";
import workspaceSchema from "../../../schemas/v1/workspace.schema.json";
import {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  CONNECTOR_CAPABILITIES,
  DATA_DOMAINS,
  JOB_STATUSES,
  JOB_TYPES,
  READY_PACKAGE_STATUSES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  STAGING_DOCUMENT_STATUSES,
  SYNC_MODES,
  WORKER_STATUSES,
  hasForbiddenSecretValue,
  isCollectionPlan,
  isConnectorManifest,
  isRawArtifact,
  isSchemaV1Contract,
  isSourceDefinition,
  isWorkspace,
} from "../src/index";

describe("public contract vocabularies", () => {
  it("exports unique, non-empty values", () => {
    const vocabularies = [
      SOURCE_TYPES,
      SOURCE_STATUSES,
      JOB_TYPES,
      JOB_STATUSES,
      WORKER_STATUSES,
      ARTIFACT_STATUSES,
      STAGING_DOCUMENT_STATUSES,
      READY_PACKAGE_STATUSES,
      DATA_DOMAINS,
      SYNC_MODES,
      CONNECTOR_CAPABILITIES,
      ARTIFACT_KINDS,
    ];

    for (const values of vocabularies) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((value) => value === value.toUpperCase())).toBe(true);
    }
  });

  it("preserves required platform states", () => {
    expect(SOURCE_TYPES).toContain("WEB");
    expect(JOB_STATUSES).toContain("DEAD_LETTER");
    expect(STAGING_DOCUMENT_STATUSES).toContain("CONFLICT");
    expect(READY_PACKAGE_STATUSES).toContain("PUBLISHED");
    expect(SYNC_MODES).toEqual(["RAW", "METADATA", "LOCAL_ONLY"]);
  });
});

describe("Schema v1 fixtures", () => {
  it("accepts every canonical valid fixture", () => {
    expect(isWorkspace(workspaceFixture)).toBe(true);
    expect(isConnectorManifest(connectorManifestFixture)).toBe(true);
    expect(isCollectionPlan(collectionPlanFixture)).toBe(true);
    expect(isSourceDefinition(sourceDefinitionFixture)).toBe(true);
    expect(isRawArtifact(rawArtifactFixture)).toBe(true);

    for (const fixture of [
      workspaceFixture,
      connectorManifestFixture,
      collectionPlanFixture,
      sourceDefinitionFixture,
      rawArtifactFixture,
    ]) {
      expect(isSchemaV1Contract(fixture)).toBe(true);
    }
  });

  it("rejects invalid typed identifiers and unknown top-level fields", () => {
    expect(isWorkspace({ ...workspaceFixture, id: "workspace-1" })).toBe(false);
    expect(isSourceDefinition({ ...sourceDefinitionFixture, unexpected: true })).toBe(false);
  });

  it("enforces conditional schedule fields", () => {
    const missingCronTimezone = {
      ...collectionPlanFixture,
      schedule: { mode: "CRON", expression: "0 7 * * *" },
    };
    const manualWithInterval = {
      ...collectionPlanFixture,
      schedule: { mode: "MANUAL", intervalSeconds: 3600 },
    };

    expect(isCollectionPlan(missingCronTimezone)).toBe(false);
    expect(isCollectionPlan(manualWithInterval)).toBe(false);
  });

  it("excludes credential values from source configuration", () => {
    expect(hasForbiddenSecretValue({ nested: { apiKey: "not-allowed" } })).toBe(true);
    expect(
      isSourceDefinition({
        ...sourceDefinitionFixture,
        connectorConfig: { endpoint: "https://example.com", password: "not-allowed" },
      }),
    ).toBe(false);
    expect(
      isSourceDefinition({
        ...sourceDefinitionFixture,
        secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FB3",
      }),
    ).toBe(true);
  });

  it("enforces immutable RawArtifact version chains", () => {
    expect(
      isRawArtifact({
        ...rawArtifactFixture,
        version: 2,
      }),
    ).toBe(false);

    expect(
      isRawArtifact({
        ...rawArtifactFixture,
        version: 2,
        supersedesArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FB4",
      }),
    ).toBe(true);

    expect(
      isRawArtifact({
        ...rawArtifactFixture,
        supersedesArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FB4",
      }),
    ).toBe(false);
  });
});

describe("canonical JSON Schemas", () => {
  it("uses Draft 2020-12 and strict contract roots", () => {
    for (const schema of [
      workspaceSchema,
      connectorManifestSchema,
      collectionPlanSchema,
      sourceDefinitionSchema,
      rawArtifactSchema,
    ]) {
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.$id).toContain("/knowledge/v1/");
    }
  });

  it("keeps key JSON Schema vocabularies aligned with TypeScript", () => {
    expect(workspaceSchema.properties.dataDomain.enum).toEqual(DATA_DOMAINS);
    expect(workspaceSchema.properties.syncPolicy.properties.mode.enum).toEqual(SYNC_MODES);
    expect(connectorManifestSchema.properties.capabilities.items.enum).toEqual(
      CONNECTOR_CAPABILITIES,
    );
  });
});
