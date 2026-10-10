export const USPTO_ID_MANUAL_SNAPSHOT_SCHEMA_V1 = "markorbit.uspto-id-manual.snapshot.v1" as const;

export const USPTO_ID_MANUAL_ROW_SCHEMA_V1 = "markorbit.uspto-id-manual.row.v1" as const;

export const USPTO_ID_MANUAL_COLUMNS = [
  "Term ID",
  "Class",
  "Description",
  "Status",
  "Start Effective Date",
  "Type",
  "Notes",
  "TM5",
  "NCL Version",
] as const;

export type UsptoIdManualStatus = "A" | "M" | "X" | "D";
export type UsptoIdManualNormalizedType = "GOODS" | "SERVICES";

export type UsptoIdManualRowV1 = {
  schemaVersion: typeof USPTO_ID_MANUAL_ROW_SCHEMA_V1;
  ordinal: number;
  termId: string;
  classCode: string;
  description: string;
  status: UsptoIdManualStatus;
  startEffectiveDateRaw: string;
  startEffectiveDate: string;
  typeRaw: string;
  typeNormalized: UsptoIdManualNormalizedType;
  notes: string;
  tm5Raw: string;
  tm5: boolean;
  nclVersionRaw: string;
  nclVersion: string;
  rowSha256: string;
};

export type UsptoIdManualSnapshotManifestV1 = {
  schemaVersion: typeof USPTO_ID_MANUAL_SNAPSHOT_SCHEMA_V1;
  dataset: "USPTO_ID_MANUAL";
  jurisdiction: "US";
  authority: "USPTO";
  artifact: {
    rawArtifactId: string;
    originalName: string;
    detectedMediaType: "text/html";
    sizeBytes: number;
    binarySha256: string;
    sourceUri: string;
    storageUri: string;
    capturedAt: string;
  };
  parser: {
    id: "markorbit-knowledge/uspto-id-manual-html";
    version: string;
  };
  rows: {
    path: "rows.ndjson";
    sha256: string;
    count: number;
    distinctTermIdCount: number;
    duplicateTermIdCount: number;
    columns: typeof USPTO_ID_MANUAL_COLUMNS;
    statusCounts: Record<UsptoIdManualStatus, number>;
    typeCounts: Record<string, number>;
  };
  validation: {
    status: "PASS";
    tableCount: number;
    nonEmptyTableCount: number;
    htmlRowCount: number;
    cellCount: number;
    requiredCellsPresent: true;
    datesValid: true;
  };
  createdAt: string;
};
