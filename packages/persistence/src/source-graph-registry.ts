import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isSourceGraphEdge,
  isSourceGraphNode,
  isWebsiteSourceProfile,
  validateSourceGraphObservationBatch,
  type SourceGraphEdge,
  type SourceGraphNode,
  type SourceGraphObservationBatch,
  type SourceGraphProvenance,
  type SourceGraphReviewState,
  type WebsiteSourceProfile,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryNotFoundError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "1100_source_graph_registry";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type SourceGraphIdPrefix = "spf" | "sgn" | "sge" | "sgb";

export type SourceGraphBatchIngestResult = {
  batchId: string;
  profileId: string;
  replayed: boolean;
  nodesInserted: number;
  nodesUpdated: number;
  edgesInserted: number;
  edgesUpdated: number;
  nodeIdMap: Record<string, string>;
};

export type SourceGraphSnapshot = {
  profile: WebsiteSourceProfile;
  nodes: SourceGraphNode[];
  edges: SourceGraphEdge[];
  summary: {
    nodeCount: number;
    edgeCount: number;
    nodeKinds: Record<string, number>;
    reviewStates: Record<string, number>;
    lifecycleStates: Record<string, number>;
  };
};

export interface SourceGraphRepository {
  createProfile(profile: WebsiteSourceProfile, rootNode: SourceGraphNode): WebsiteSourceProfile;
  getProfileById(profileId: string): WebsiteSourceProfile | null;
  getProfileBySourceId(sourceId: string): WebsiteSourceProfile | null;
  getProfileByCanonicalOrigin(
    workspaceId: string,
    canonicalOrigin: string,
  ): WebsiteSourceProfile | null;
  getNode(nodeId: string): SourceGraphNode | null;
  findNodeByIdentity(
    profileId: string,
    strategy: SourceGraphNode["identity"]["strategy"],
    key: string,
  ): SourceGraphNode | null;
  listNodes(profileId: string): SourceGraphNode[];
  listEdges(profileId: string): SourceGraphEdge[];
  ingestObservationBatch(batch: SourceGraphObservationBatch): SourceGraphBatchIngestResult;
  reviewNode(nodeId: string, state: Exclude<SourceGraphReviewState, "OBSERVED">): SourceGraphNode;
  snapshotBySourceId(sourceId: string): SourceGraphSnapshot | null;
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function generateSourceGraphId(prefix: SourceGraphIdPrefix, now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function canonicalOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RegistryValidationError("Source Graph origin must use http or https");
  }
  return `${url.origin}/`;
}

function parseProfile(value: unknown): WebsiteSourceProfile {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isWebsiteSourceProfile(parsed)) {
    throw new RegistryValidationError(
      "Persisted WebsiteSourceProfile violates Source Graph Protocol v1",
    );
  }
  return parsed;
}

function parseNode(value: unknown): SourceGraphNode {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isSourceGraphNode(parsed)) {
    throw new RegistryValidationError(
      "Persisted SourceGraphNode violates Source Graph Protocol v1",
    );
  }
  return parsed;
}

function parseEdge(value: unknown): SourceGraphEdge {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isSourceGraphEdge(parsed)) {
    throw new RegistryValidationError(
      "Persisted SourceGraphEdge violates Source Graph Protocol v1",
    );
  }
  return parsed;
}

function ensureSourceGraphMigration(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS source_graph_profiles (
        profile_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        canonical_origin TEXT NOT NULL,
        canonical_host TEXT NOT NULL,
        root_node_id TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, source_id),
        UNIQUE (workspace_id, canonical_origin)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_graph_nodes (
        node_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        identity_strategy TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        review_state TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        first_observed_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        UNIQUE (profile_id, identity_strategy, identity_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_graph_edges (
        edge_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject_node_id TEXT NOT NULL,
        object_node_id TEXT NOT NULL,
        review_state TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        first_observed_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        UNIQUE (profile_id, kind, subject_node_id, object_node_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS source_graph_batches (
        batch_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        document_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (profile_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_source_graph_profiles_source
        ON source_graph_profiles(workspace_id, source_id);
      CREATE INDEX IF NOT EXISTS idx_source_graph_nodes_profile_kind
        ON source_graph_nodes(profile_id, kind, lifecycle_state, review_state);
      CREATE INDEX IF NOT EXISTS idx_source_graph_nodes_last_observed
        ON source_graph_nodes(profile_id, last_observed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_source_graph_edges_profile_kind
        ON source_graph_edges(profile_id, kind);
      CREATE INDEX IF NOT EXISTS idx_source_graph_batches_profile_observed
        ON source_graph_batches(profile_id, observed_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

function compareTimestamp(a: string, b: string): number {
  return Date.parse(a) - Date.parse(b);
}

function earliest(a: string, b: string): string {
  return compareTimestamp(a, b) <= 0 ? a : b;
}

function latest(a: string, b: string): string {
  return compareTimestamp(a, b) >= 0 ? a : b;
}

function mergeProvenance(
  existing: SourceGraphProvenance[],
  incoming: SourceGraphProvenance[],
): SourceGraphProvenance[] {
  const merged: SourceGraphProvenance[] = [];
  const seen = new Set<string>();
  for (const item of [...existing, ...incoming]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeReviewState(
  existing: SourceGraphReviewState,
  incoming: SourceGraphReviewState,
): SourceGraphReviewState {
  return existing === "OBSERVED" ? incoming : existing;
}

function mergeNode(existing: SourceGraphNode, incoming: SourceGraphNode): SourceGraphNode {
  if (
    existing.profileId !== incoming.profileId ||
    existing.sourceId !== incoming.sourceId ||
    existing.workspaceId !== incoming.workspaceId ||
    existing.kind !== incoming.kind ||
    existing.identity.strategy !== incoming.identity.strategy ||
    existing.identity.key !== incoming.identity.key
  ) {
    throw new RegistryConflictError(
      "SOURCE_GRAPH_NODE_IDENTITY_CONFLICT",
      `Source Graph node ${existing.id} cannot change scope, kind, or identity`,
    );
  }

  const merged = {
    ...existing,
    ...incoming,
    id: existing.id,
    identity: existing.identity,
    firstObservedAt: earliest(existing.firstObservedAt, incoming.firstObservedAt),
    lastObservedAt: latest(existing.lastObservedAt, incoming.lastObservedAt),
    reviewState: mergeReviewState(existing.reviewState, incoming.reviewState),
    lifecycleState:
      existing.lifecycleState === "REMOVED"
        ? "REMOVED"
        : existing.lifecycleState === "STALE" && incoming.lifecycleState === "ACTIVE"
          ? "ACTIVE"
          : incoming.lifecycleState,
    provenance: mergeProvenance(existing.provenance, incoming.provenance),
  } as SourceGraphNode;

  if (!isSourceGraphNode(merged)) {
    throw new RegistryValidationError("Merged Source Graph node violates Source Graph Protocol v1");
  }
  return merged;
}

function mergeEdge(existing: SourceGraphEdge, incoming: SourceGraphEdge): SourceGraphEdge {
  if (
    existing.profileId !== incoming.profileId ||
    existing.sourceId !== incoming.sourceId ||
    existing.workspaceId !== incoming.workspaceId ||
    existing.kind !== incoming.kind ||
    existing.subjectNodeId !== incoming.subjectNodeId ||
    existing.objectNodeId !== incoming.objectNodeId
  ) {
    throw new RegistryConflictError(
      "SOURCE_GRAPH_EDGE_IDENTITY_CONFLICT",
      `Source Graph edge ${existing.id} cannot change scope or endpoints`,
    );
  }

  const merged: SourceGraphEdge = {
    ...existing,
    ...incoming,
    id: existing.id,
    firstObservedAt: earliest(existing.firstObservedAt, incoming.firstObservedAt),
    lastObservedAt: latest(existing.lastObservedAt, incoming.lastObservedAt),
    reviewState: mergeReviewState(existing.reviewState, incoming.reviewState),
    lifecycleState:
      existing.lifecycleState === "REMOVED"
        ? "REMOVED"
        : existing.lifecycleState === "STALE" && incoming.lifecycleState === "ACTIVE"
          ? "ACTIVE"
          : incoming.lifecycleState,
    provenance: mergeProvenance(existing.provenance, incoming.provenance),
  };

  if (!isSourceGraphEdge(merged)) {
    throw new RegistryValidationError("Merged Source Graph edge violates Source Graph Protocol v1");
  }
  return merged;
}

function digestBatch(batch: SourceGraphObservationBatch): string {
  return createHash("sha256").update(JSON.stringify(batch)).digest("hex");
}

function parseBatchResult(value: unknown): SourceGraphBatchIngestResult {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new RegistryValidationError("Persisted Source Graph batch result is invalid");
  }
  return parsed as SourceGraphBatchIngestResult;
}

function runSavepoint<T>(database: DatabaseSync, name: string, operation: () => T): T {
  database.exec(`SAVEPOINT ${name};`);
  try {
    const result = operation();
    database.exec(`RELEASE SAVEPOINT ${name};`);
    return result;
  } catch (error) {
    database.exec(`ROLLBACK TO SAVEPOINT ${name};`);
    database.exec(`RELEASE SAVEPOINT ${name};`);
    throw error;
  }
}

export class SqliteSourceGraphRepository implements SourceGraphRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureSourceGraphMigration(database);
  }

  createProfile(profile: WebsiteSourceProfile, rootNode: SourceGraphNode): WebsiteSourceProfile {
    if (!isWebsiteSourceProfile(profile)) {
      throw new RegistryValidationError("WebsiteSourceProfile violates Source Graph Protocol v1");
    }
    if (!isSourceGraphNode(rootNode) || rootNode.kind !== "WEBSITE") {
      throw new RegistryValidationError("WebsiteSourceProfile requires a valid WEBSITE root node");
    }
    if (
      rootNode.id !== profile.rootNodeId ||
      rootNode.workspaceId !== profile.workspaceId ||
      rootNode.sourceId !== profile.sourceId ||
      rootNode.profileId !== profile.id
    ) {
      throw new RegistryValidationError(
        "WebsiteSourceProfile and root node must share exact scope",
      );
    }
    if (canonicalOrigin(rootNode.canonicalOrigin) !== canonicalOrigin(profile.canonicalOrigin)) {
      throw new RegistryValidationError(
        "WebsiteSourceProfile and root node must share canonical origin",
      );
    }

    const existingBySource = this.getProfileBySourceId(profile.sourceId);
    if (existingBySource) {
      if (
        canonicalOrigin(existingBySource.canonicalOrigin) !==
        canonicalOrigin(profile.canonicalOrigin)
      ) {
        throw new RegistryConflictError(
          "SOURCE_GRAPH_PROFILE_SOURCE_CONFLICT",
          `Source ${profile.sourceId} is already bound to another website profile`,
        );
      }
      return existingBySource;
    }
    const existingByOrigin = this.getProfileByCanonicalOrigin(
      profile.workspaceId,
      canonicalOrigin(profile.canonicalOrigin),
    );
    if (existingByOrigin && existingByOrigin.sourceId !== profile.sourceId) {
      throw new RegistryConflictError(
        "SOURCE_GRAPH_PROFILE_ORIGIN_CONFLICT",
        `Website origin ${profile.canonicalOrigin} is already governed by source ${existingByOrigin.sourceId}`,
      );
    }

    return runSavepoint(this.database, "source_graph_create_profile", () => {
      this.database
        .prepare(
          `INSERT INTO source_graph_profiles (
             profile_id, workspace_id, source_id, canonical_origin, canonical_host,
             root_node_id, document_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          profile.id,
          profile.workspaceId,
          profile.sourceId,
          canonicalOrigin(profile.canonicalOrigin),
          profile.canonicalHost,
          profile.rootNodeId,
          JSON.stringify(profile),
          profile.createdAt,
          profile.updatedAt,
        );
      this.insertNode(rootNode);
      return profile;
    });
  }

  getProfileById(profileId: string): WebsiteSourceProfile | null {
    const row = this.database
      .prepare("SELECT document_json FROM source_graph_profiles WHERE profile_id = ?")
      .get(profileId) as { document_json: string } | undefined;
    return row ? parseProfile(row.document_json) : null;
  }

  getProfileBySourceId(sourceId: string): WebsiteSourceProfile | null {
    const row = this.database
      .prepare("SELECT document_json FROM source_graph_profiles WHERE source_id = ?")
      .get(sourceId) as { document_json: string } | undefined;
    return row ? parseProfile(row.document_json) : null;
  }

  getProfileByCanonicalOrigin(workspaceId: string, value: string): WebsiteSourceProfile | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM source_graph_profiles
         WHERE workspace_id = ? AND canonical_origin = ?`,
      )
      .get(workspaceId, canonicalOrigin(value)) as { document_json: string } | undefined;
    return row ? parseProfile(row.document_json) : null;
  }

  getNode(nodeId: string): SourceGraphNode | null {
    const row = this.database
      .prepare("SELECT document_json FROM source_graph_nodes WHERE node_id = ?")
      .get(nodeId) as { document_json: string } | undefined;
    return row ? parseNode(row.document_json) : null;
  }

  findNodeByIdentity(
    profileId: string,
    strategy: SourceGraphNode["identity"]["strategy"],
    key: string,
  ): SourceGraphNode | null {
    const row = this.database
      .prepare(
        `SELECT document_json FROM source_graph_nodes
         WHERE profile_id = ? AND identity_strategy = ? AND identity_key = ?`,
      )
      .get(profileId, strategy, key) as { document_json: string } | undefined;
    return row ? parseNode(row.document_json) : null;
  }

  listNodes(profileId: string): SourceGraphNode[] {
    return this.database
      .prepare(
        `SELECT document_json FROM source_graph_nodes
         WHERE profile_id = ? ORDER BY first_observed_at, node_id`,
      )
      .all(profileId)
      .map((row) => parseNode((row as { document_json: string }).document_json));
  }

  listEdges(profileId: string): SourceGraphEdge[] {
    return this.database
      .prepare(
        `SELECT document_json FROM source_graph_edges
         WHERE profile_id = ? ORDER BY first_observed_at, edge_id`,
      )
      .all(profileId)
      .map((row) => parseEdge((row as { document_json: string }).document_json));
  }

  ingestObservationBatch(batch: SourceGraphObservationBatch): SourceGraphBatchIngestResult {
    const issues = validateSourceGraphObservationBatch(batch);
    if (issues.length > 0) {
      throw new RegistryValidationError("Source Graph observation batch is invalid", { issues });
    }

    const profile = this.getProfileById(batch.profileId);
    if (!profile) {
      throw new RegistryConflictError(
        "SOURCE_GRAPH_PROFILE_MISSING",
        `Source Graph profile ${batch.profileId} does not exist`,
      );
    }
    if (profile.workspaceId !== batch.workspaceId || profile.sourceId !== batch.sourceId) {
      throw new RegistryValidationError("Observation batch escapes its WebsiteSourceProfile scope");
    }

    const payloadSha256 = digestBatch(batch);
    const replay = this.database
      .prepare(
        `SELECT batch_id, payload_sha256, result_json FROM source_graph_batches
         WHERE profile_id = ? AND idempotency_key = ?`,
      )
      .get(batch.profileId, batch.idempotencyKey) as
      { batch_id: string; payload_sha256: string; result_json: string } | undefined;
    if (replay) {
      if (replay.payload_sha256 !== payloadSha256) {
        throw new RegistryConflictError(
          "SOURCE_GRAPH_IDEMPOTENCY_CONFLICT",
          `Idempotency key ${batch.idempotencyKey} was already used with different content`,
        );
      }
      return { ...parseBatchResult(replay.result_json), replayed: true };
    }

    const batchIdCollision = this.database
      .prepare("SELECT payload_sha256 FROM source_graph_batches WHERE batch_id = ?")
      .get(batch.id) as { payload_sha256: string } | undefined;
    if (batchIdCollision) {
      throw new RegistryConflictError(
        "SOURCE_GRAPH_BATCH_ID_CONFLICT",
        `Source Graph batch id ${batch.id} is already registered`,
      );
    }

    return runSavepoint(this.database, "source_graph_ingest_batch", () => {
      let nodesInserted = 0;
      let nodesUpdated = 0;
      let edgesInserted = 0;
      let edgesUpdated = 0;
      const nodeIdMap: Record<string, string> = {};

      for (const incoming of batch.nodes) {
        if (
          incoming.workspaceId !== batch.workspaceId ||
          incoming.sourceId !== batch.sourceId ||
          incoming.profileId !== batch.profileId
        ) {
          throw new RegistryValidationError(`Node ${incoming.id} escapes observation batch scope`);
        }

        const byIdentity = this.findNodeByIdentity(
          incoming.profileId,
          incoming.identity.strategy,
          incoming.identity.key,
        );
        const byId = this.getNode(incoming.id);
        if (byId && byIdentity && byId.id !== byIdentity.id) {
          throw new RegistryConflictError(
            "SOURCE_GRAPH_NODE_ID_CONFLICT",
            `Node ${incoming.id} and identity ${incoming.identity.key} resolve to different persisted nodes`,
          );
        }

        const existing = byIdentity ?? byId;
        if (!existing) {
          this.insertNode(incoming);
          nodeIdMap[incoming.id] = incoming.id;
          nodesInserted += 1;
        } else {
          const merged = mergeNode(existing, incoming);
          this.updateNode(merged);
          nodeIdMap[incoming.id] = existing.id;
          nodesUpdated += 1;
        }
      }

      for (const incoming of batch.edges) {
        if (
          incoming.workspaceId !== batch.workspaceId ||
          incoming.sourceId !== batch.sourceId ||
          incoming.profileId !== batch.profileId
        ) {
          throw new RegistryValidationError(`Edge ${incoming.id} escapes observation batch scope`);
        }
        const subjectNodeId = nodeIdMap[incoming.subjectNodeId] ?? incoming.subjectNodeId;
        const objectNodeId = nodeIdMap[incoming.objectNodeId] ?? incoming.objectNodeId;
        const subject = this.getNode(subjectNodeId);
        const object = this.getNode(objectNodeId);
        if (!subject || !object) {
          throw new RegistryValidationError(`Edge ${incoming.id} references a missing node`);
        }
        if (subject.profileId !== batch.profileId || object.profileId !== batch.profileId) {
          throw new RegistryValidationError(
            `Edge ${incoming.id} crosses WebsiteSourceProfile boundaries`,
          );
        }
        if (subjectNodeId === objectNodeId) {
          throw new RegistryValidationError(
            `Edge ${incoming.id} collapses to a self-edge after deduplication`,
          );
        }

        const rewired: SourceGraphEdge = {
          ...incoming,
          subjectNodeId,
          objectNodeId,
        };
        if (!isSourceGraphEdge(rewired)) {
          throw new RegistryValidationError(
            `Edge ${incoming.id} is invalid after node deduplication`,
          );
        }

        const semantic = this.database
          .prepare(
            `SELECT document_json FROM source_graph_edges
             WHERE profile_id = ? AND kind = ? AND subject_node_id = ? AND object_node_id = ?`,
          )
          .get(batch.profileId, rewired.kind, subjectNodeId, objectNodeId) as
          { document_json: string } | undefined;
        const byId = this.database
          .prepare("SELECT document_json FROM source_graph_edges WHERE edge_id = ?")
          .get(rewired.id) as { document_json: string } | undefined;
        const existing = semantic
          ? parseEdge(semantic.document_json)
          : byId
            ? parseEdge(byId.document_json)
            : null;
        if (!existing) {
          this.insertEdge(rewired);
          edgesInserted += 1;
        } else {
          const merged = mergeEdge(existing, { ...rewired, id: existing.id });
          this.updateEdge(merged);
          edgesUpdated += 1;
        }
      }

      const result: SourceGraphBatchIngestResult = {
        batchId: batch.id,
        profileId: batch.profileId,
        replayed: false,
        nodesInserted,
        nodesUpdated,
        edgesInserted,
        edgesUpdated,
        nodeIdMap,
      };
      this.database
        .prepare(
          `INSERT INTO source_graph_batches (
             batch_id, workspace_id, source_id, profile_id, idempotency_key,
             payload_sha256, document_json, result_json, observed_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          batch.id,
          batch.workspaceId,
          batch.sourceId,
          batch.profileId,
          batch.idempotencyKey,
          payloadSha256,
          JSON.stringify(batch),
          JSON.stringify(result),
          batch.observedAt,
          this.clock().toISOString(),
        );
      return result;
    });
  }

  reviewNode(nodeId: string, state: Exclude<SourceGraphReviewState, "OBSERVED">): SourceGraphNode {
    if (state !== "RETAINED" && state !== "REJECTED") {
      throw new RegistryValidationError(
        "Source Graph human review state must be RETAINED or REJECTED",
      );
    }
    const current = this.getNode(nodeId);
    if (!current) {
      throw new RegistryConflictError(
        "SOURCE_GRAPH_NODE_NOT_FOUND",
        `Source Graph node ${nodeId} was not found`,
      );
    }
    const next: SourceGraphNode = { ...current, reviewState: state };
    if (!isSourceGraphNode(next)) {
      throw new RegistryValidationError(
        "Reviewed Source Graph node violates Source Graph Protocol v1",
      );
    }
    this.updateNode(next);
    return next;
  }

  snapshotBySourceId(sourceId: string): SourceGraphSnapshot | null {
    const profile = this.getProfileBySourceId(sourceId);
    if (!profile) return null;
    const nodes = this.listNodes(profile.id);
    const edges = this.listEdges(profile.id);
    const nodeKinds: Record<string, number> = {};
    const reviewStates: Record<string, number> = {};
    const lifecycleStates: Record<string, number> = {};
    for (const node of nodes) {
      nodeKinds[node.kind] = (nodeKinds[node.kind] ?? 0) + 1;
      reviewStates[node.reviewState] = (reviewStates[node.reviewState] ?? 0) + 1;
      lifecycleStates[node.lifecycleState] = (lifecycleStates[node.lifecycleState] ?? 0) + 1;
    }
    return {
      profile,
      nodes,
      edges,
      summary: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodeKinds,
        reviewStates,
        lifecycleStates,
      },
    };
  }

  private insertNode(node: SourceGraphNode): void {
    const existingById = this.getNode(node.id);
    if (existingById) {
      throw new RegistryConflictError(
        "SOURCE_GRAPH_NODE_ID_CONFLICT",
        `Source Graph node id ${node.id} already exists`,
      );
    }
    this.database
      .prepare(
        `INSERT INTO source_graph_nodes (
           node_id, workspace_id, source_id, profile_id, kind, identity_strategy,
           identity_key, review_state, lifecycle_state, first_observed_at,
           last_observed_at, document_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        node.id,
        node.workspaceId,
        node.sourceId,
        node.profileId,
        node.kind,
        node.identity.strategy,
        node.identity.key,
        node.reviewState,
        node.lifecycleState,
        node.firstObservedAt,
        node.lastObservedAt,
        JSON.stringify(node),
      );
  }

  private updateNode(node: SourceGraphNode): void {
    this.database
      .prepare(
        `UPDATE source_graph_nodes SET
           review_state = ?, lifecycle_state = ?, first_observed_at = ?,
           last_observed_at = ?, document_json = ?
         WHERE node_id = ?`,
      )
      .run(
        node.reviewState,
        node.lifecycleState,
        node.firstObservedAt,
        node.lastObservedAt,
        JSON.stringify(node),
        node.id,
      );
  }

  private insertEdge(edge: SourceGraphEdge): void {
    this.database
      .prepare(
        `INSERT INTO source_graph_edges (
           edge_id, workspace_id, source_id, profile_id, kind, subject_node_id,
           object_node_id, review_state, lifecycle_state, first_observed_at,
           last_observed_at, document_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        edge.id,
        edge.workspaceId,
        edge.sourceId,
        edge.profileId,
        edge.kind,
        edge.subjectNodeId,
        edge.objectNodeId,
        edge.reviewState,
        edge.lifecycleState,
        edge.firstObservedAt,
        edge.lastObservedAt,
        JSON.stringify(edge),
      );
  }

  private updateEdge(edge: SourceGraphEdge): void {
    this.database
      .prepare(
        `UPDATE source_graph_edges SET
           review_state = ?, lifecycle_state = ?, first_observed_at = ?,
           last_observed_at = ?, document_json = ?
         WHERE edge_id = ?`,
      )
      .run(
        edge.reviewState,
        edge.lifecycleState,
        edge.firstObservedAt,
        edge.lastObservedAt,
        JSON.stringify(edge),
        edge.id,
      );
  }
}

export function assertSourceGraphSourceExists(
  repository: SourceGraphRepository,
  sourceId: string,
): WebsiteSourceProfile {
  const profile = repository.getProfileBySourceId(sourceId);
  if (!profile) throw new RegistryNotFoundError(sourceId);
  return profile;
}
