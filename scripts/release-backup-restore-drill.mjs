import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const root = mkdtempSync(join(tmpdir(), "markorbit-knowledge-release-drill-"));
const live = join(root, "live");
const backup = join(root, "backup");
const restored = join(root, "restored");
const databasePath = join(live, "markorbit-knowledge.sqlite");
const rawPath = join(live, "artifacts", "sha256", "aa");
const stagingPath = join(live, "staging", "sha256", "bb");

const rawBytes = Buffer.from("markorbit-knowledge-release-raw-artifact\n", "utf8");
const stagingBytes = Buffer.from("# MarkOrbit Knowledge release staging probe\n", "utf8");
const rawDigest = sha256(rawBytes);
const stagingDigest = sha256(stagingBytes);

try {
  mkdirSync(rawPath, { recursive: true });
  mkdirSync(stagingPath, { recursive: true });
  writeFileSync(join(rawPath, `${rawDigest}.bin`), rawBytes);
  writeFileSync(join(stagingPath, `${stagingDigest}.md`), stagingBytes);

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE release_probe (
      id TEXT PRIMARY KEY,
      release_version TEXT NOT NULL,
      raw_sha256 TEXT NOT NULL,
      staging_sha256 TEXT NOT NULL
    ) STRICT;
  `);
  database
    .prepare(
      "INSERT INTO release_probe (id, release_version, raw_sha256, staging_sha256) VALUES (?, ?, ?, ?)",
    )
    .run("cold-backup-drill", "0.1.0", rawDigest, stagingDigest);
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.close();

  // The supported v0.1 contract is quiesced/cold: copy only after SQLite is closed.
  cpSync(live, backup, { recursive: true, force: false, errorOnExist: true });
  cpSync(backup, restored, { recursive: true, force: false, errorOnExist: true });

  const restoredDatabase = new DatabaseSync(join(restored, "markorbit-knowledge.sqlite"), {
    readOnly: true,
  });
  const integrity = restoredDatabase.prepare("PRAGMA integrity_check").get();
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`restored SQLite integrity_check failed: ${JSON.stringify(integrity)}`);
  }
  const row = restoredDatabase
    .prepare(
      "SELECT release_version, raw_sha256, staging_sha256 FROM release_probe WHERE id = ?",
    )
    .get("cold-backup-drill");
  restoredDatabase.close();

  if (!row || row.release_version !== "0.1.0") {
    throw new Error("restored SQLite release probe is missing or changed");
  }
  if (row.raw_sha256 !== rawDigest || row.staging_sha256 !== stagingDigest) {
    throw new Error("restored SQLite CAS evidence does not match the frozen probe");
  }

  const restoredRaw = readFileSync(join(restored, "artifacts", "sha256", "aa", `${rawDigest}.bin`));
  const restoredStaging = readFileSync(
    join(restored, "staging", "sha256", "bb", `${stagingDigest}.md`),
  );
  if (sha256(restoredRaw) !== rawDigest) throw new Error("restored RawArtifact CAS hash mismatch");
  if (sha256(restoredStaging) !== stagingDigest) throw new Error("restored Staging CAS hash mismatch");

  console.log("Knowledge v0.1 cold backup/restore drill passed:");
  console.log("  ✓ SQLite closed before coordinated copy");
  console.log("  ✓ restored SQLite PRAGMA integrity_check = ok");
  console.log("  ✓ release probe row survived restore");
  console.log("  ✓ RawArtifact CAS bytes/hash survived restore");
  console.log("  ✓ Staging CAS bytes/hash survived restore");
} finally {
  rmSync(root, { recursive: true, force: true });
}
