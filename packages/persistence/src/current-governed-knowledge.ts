import type { DatabaseSync } from "node:sqlite";
import {
  CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE,
  CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION,
  KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1,
  type CurrentGovernedKnowledgeV1,
  type KnowledgeAdmissibilityReasonCode,
  type KnowledgeRetrievalChannelV1,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "./index";

export type CurrentGovernedKnowledgeProjectionInput = {
  workspaceId: string;
  stagingDocumentId: string;
  viewerWorkspaceId?: string;
  channel?: KnowledgeRetrievalChannelV1;
};

type ProjectionRow = {
  source_id: string;
  is_current: number | null;
  ready_package_id: string | null;
  workspace_json: string | null;
  source_json: string | null;
  ready_package_json: string | null;
};
function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function object(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function corpusVisibility(
  viewerWorkspaceId: string,
  knowledgeWorkspaceId: string,
  channel?: KnowledgeRetrievalChannelV1,
): KnowledgeAdmissibilityReasonCode | null {
  if (viewerWorkspaceId === knowledgeWorkspaceId) return null;
  if (knowledgeWorkspaceId !== DEFAULT_WORKSPACE.id) return "CORPUS_NOT_VISIBLE";
  if (viewerWorkspaceId === DEFAULT_WORKSPACE.id) return "CORPUS_NOT_VISIBLE";
  if (!channel) return null;
  return KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1[channel].globalOverlay === "SUPPORTED"
    ? null
    : "CHANNEL_GLOBAL_OVERLAY_UNSUPPORTED";
}
function emptyProjection(
  workspaceId: string,
  stagingDocumentId: string,
): CurrentGovernedKnowledgeV1 {
  return {
    protocolVersion: CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE,
    workspaceId,
    stagingDocumentId,
    sourceId: null,
    readyPackageId: null,
    states: {
      current: false,
      verified: false,
      consumerAdmissible: false,
      delivered: false,
    },
    reasonCodes: ["CONTENT_NOT_INDEXED", "VERIFICATION_MISSING"],
  };
}

export function projectCurrentGovernedKnowledge(
  database: DatabaseSync,
  input: CurrentGovernedKnowledgeProjectionInput,
): CurrentGovernedKnowledgeV1 {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const stagingDocumentId = required(input.stagingDocumentId, "stagingDocumentId");
  const viewerWorkspaceId = required(input.viewerWorkspaceId ?? workspaceId, "viewerWorkspaceId");
  const row = database
    .prepare(
      `SELECT s.source_id,
              rd.is_current,
              rd.ready_package_id,
              w.document_json AS workspace_json,
              src.document_json AS source_json,
              rp.document_json AS ready_package_json
       FROM staging_documents s
       LEFT JOIN retrieval_documents rd
         ON rd.workspace_id = s.workspace_id AND rd.staging_document_id = s.id
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       LEFT JOIN source_definitions src
         ON src.id = s.source_id AND src.workspace_id = s.workspace_id
       LEFT JOIN ready_packages rp
         ON rp.id = rd.ready_package_id AND rp.workspace_id = s.workspace_id
       WHERE s.workspace_id = ? AND s.id = ?
       LIMIT 1`,
    )
    .get(workspaceId, stagingDocumentId) as ProjectionRow | undefined;

  if (!row) return emptyProjection(workspaceId, stagingDocumentId);

  const reasons: KnowledgeAdmissibilityReasonCode[] = [];
  const current = row.is_current === 1;
  if (row.is_current === null) reasons.push("CONTENT_NOT_INDEXED");
  else if (!current) reasons.push("CONTENT_NOT_CURRENT");
  const workspace = object(row.workspace_json);
  if (workspace?.status !== "ACTIVE") reasons.push("WORKSPACE_INACTIVE");

  const source = object(row.source_json);
  if (source?.status === "ARCHIVED") reasons.push("SOURCE_ARCHIVED");

  const readyPackage = object(row.ready_package_json);
  const readyStatus = typeof readyPackage?.status === "string" ? readyPackage.status : null;
  const evidence =
    readyPackage && typeof readyPackage.evidence === "object" && readyPackage.evidence !== null
      ? (readyPackage.evidence as Record<string, unknown>)
      : null;
  const outcome =
    typeof evidence?.verificationOutcome === "string" ? evidence.verificationOutcome : null;
  const verifiedStatus = readyStatus === "VERIFIED" || readyStatus === "HANDED_OFF";
  const acceptableOutcome = outcome === "PASS" || outcome === "PASS_WITH_WARNINGS";
  const verified = verifiedStatus && acceptableOutcome;

  if (!readyPackage || !outcome) reasons.push("VERIFICATION_MISSING");
  else if (!verified) reasons.push("VERIFICATION_NOT_ACCEPTABLE");

  const visibilityReason = corpusVisibility(viewerWorkspaceId, workspaceId, input.channel);
  if (visibilityReason) reasons.push(visibilityReason);

  const delivered = readyStatus === "HANDED_OFF";
  const consumerAdmissible = current && verified && reasons.length === 0;
  return {
    protocolVersion: CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE,
    workspaceId,
    stagingDocumentId,
    sourceId: row.source_id,
    readyPackageId: row.ready_package_id,
    states: {
      current,
      verified,
      consumerAdmissible,
      delivered,
    },
    reasonCodes: reasons,
  };
}
