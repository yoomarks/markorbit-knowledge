from pathlib import Path

path = Path("packages/persistence/src/vault-import-execution-registry.ts")
text = path.read_text()

old_parse = """  return { ...parsed, binding, ...candidate };"""
new_parse = """  return {
    ...parsed,
    binding,
    vaultRelativePath: candidate.vaultRelativePath,
    bindingRelativePath: candidate.bindingRelativePath,
    contentHash: { algorithm: \"SHA-256\", value: candidate.observedSha256 },
    sizeBytes: candidate.sizeBytes,
  };"""
assert old_parse in text
text = text.replace(old_parse, new_parse, 1)

old_query = '          .prepare("SELECT 1 FROM staging_content_objects WHERE sha256 = ?")'
new_query = '          .prepare("SELECT 1 FROM staging_content_objects WHERE content_hash = ?")'
assert old_query in text
text = text.replace(old_query, new_query, 1)

old_race = """        const raced = this.getByImportIntent(workspaceId, importIntentId);
        if (raced) {
          this.database.exec(\"COMMIT;\");
          return { document: raced, replayed: true, contentCreated: false };
        }"""
new_race = """        const raced = this.getByImportIntent(workspaceId, importIntentId);
        if (raced) {
          if (
            raced.inspectionRunId !== inspectionRunId ||
            raced.vaultRelativePath !== candidate.vaultRelativePath ||
            raced.contentHash.value !== contentHash ||
            raced.sizeBytes !== input.content.byteLength
          ) {
            throw new RegistryConflictError(
              \"VAULT_ORIGIN_STAGING_IMPORT_INTENT_CONFLICT\",
              \"Import intent was concurrently bound to different Vault-origin Staging evidence\",
            );
          }
          this.database.exec(\"COMMIT;\");
          return { document: raced, replayed: true, contentCreated: false };
        }"""
assert old_race in text
text = text.replace(old_race, new_race, 1)

path.write_text(text)
