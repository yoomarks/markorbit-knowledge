from pathlib import Path

path = Path("packages/persistence/src/raw-artifact-registry.ts")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one match, got {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)


replace_once(
    '''export type StreamUploadResult = {
  session: ArtifactIngestionSession;
  verification: ArtifactVerificationResult;
};

export interface RawArtifactRepository {''',
    '''export type StreamUploadResult = {
  session: ArtifactIngestionSession;
  verification: ArtifactVerificationResult;
};

export type CheckArtifactContentInput = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
  artifactKind: ArtifactKind;
  canonicalUri: string;
  sha256: string;
};

export type ArtifactContentIdentityResult = {
  unchanged: boolean;
  latestArtifactId: string | null;
  latestSha256: string | null;
};

export interface RawArtifactRepository {''',
)

replace_once(
    '''  createSession(input: CreateArtifactSessionInput): {
    record: ArtifactSessionRecord;
    replayed: boolean;
  };
  uploadContent(''',
    '''  createSession(input: CreateArtifactSessionInput): {
    record: ArtifactSessionRecord;
    replayed: boolean;
  };
  checkCurrentContent(input: CheckArtifactContentInput): ArtifactContentIdentityResult;
  uploadContent(''',
)

replace_once(
    '''    return { record: this.requireSession(session.id), replayed: false };
  }

  async uploadContent(''',
    '''    return { record: this.requireSession(session.id), replayed: false };
  }

  checkCurrentContent(input: CheckArtifactContentInput): ArtifactContentIdentityResult {
    const context = this.authenticate(
      input.workerId,
      input.credential,
      input.leaseId,
      input.leaseToken,
    );
    const canonicalUri = input.canonicalUri.trim();
    if (!canonicalUri || canonicalUri.length > 2048) {
      throw new RegistryValidationError("canonicalUri must contain 1 to 2048 characters");
    }
    try {
      const parsed = new URL(canonicalUri);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      throw new RegistryValidationError("canonicalUri must be an absolute http(s) URL");
    }
    if (!ARTIFACT_KINDS.includes(input.artifactKind)) {
      throw new RegistryValidationError("Unknown artifactKind");
    }
    const sha256 = input.sha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new RegistryValidationError("sha256 must be a lowercase SHA-256 digest");
    }
    const row = this.database
      .prepare(
        `SELECT id, content_digest AS contentDigest
         FROM raw_artifacts
         WHERE workspace_id = ? AND source_id = ? AND canonical_uri = ? AND artifact_kind = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(
        context.run.workspaceId,
        context.run.sourceId,
        canonicalUri,
        input.artifactKind,
      ) as { id: string; contentDigest: string } | undefined;
    if (!row) {
      return { unchanged: false, latestArtifactId: null, latestSha256: null };
    }
    return {
      unchanged: constantTimeHexEqual(row.contentDigest, sha256),
      latestArtifactId: row.id,
      latestSha256: row.contentDigest,
    };
  }

  async uploadContent(''',
)

path.write_text(text)
