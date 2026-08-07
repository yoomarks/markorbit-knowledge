/** Shared MarkOrbit Knowledge vocabularies. */
export const SOURCE_TYPES = [
  "WEB",
  "API",
  "EMAIL",
  "LOCAL_FOLDER",
  "DATABASE",
  "GITHUB",
  "RSS",
  "MANUAL_UPLOAD",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ERROR", "ARCHIVED"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const JOB_TYPES = [
  "WEB_DISCOVERY",
  "WEB_CRAWL",
  "PAGE_UPDATE_CHECK",
  "API_COLLECTION",
  "EMAIL_IMPORT",
  "LOCAL_FILE_SCAN",
  "DOCUMENT_CONVERSION",
  "VAULT_EXPORT",
  "VAULT_IMPORT",
  "PACKAGE_BUILD",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "PENDING",
  "LEASED",
  "RUNNING",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "RETRY",
  "FAILED",
  "DEAD_LETTER",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORKER_STATUSES = [
  "ONLINE",
  "BUSY",
  "DRAINING",
  "OFFLINE",
  "DISABLED",
  "ERROR",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export const ARTIFACT_STATUSES = [
  "RECEIVED",
  "REGISTERED",
  "DUPLICATE_CHECKED",
  "READY_FOR_CONVERSION",
  "CONVERTED",
  "STAGED",
  "ARCHIVED",
] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const STAGING_DOCUMENT_STATUSES = [
  "GENERATED",
  "SYNCED",
  "EDITED",
  "VALIDATING",
  "READY",
  "PACKAGED",
  "PUBLISHED",
  "INVALID",
  "CONFLICT",
  "REJECTED",
] as const;
export type StagingDocumentStatus = (typeof STAGING_DOCUMENT_STATUSES)[number];

export const READY_PACKAGE_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "READY",
  "PUBLISHED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type ReadyPackageStatus = (typeof READY_PACKAGE_STATUSES)[number];
