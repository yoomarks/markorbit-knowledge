import { isAbsolute } from "node:path";

export type ObsidianVaultFilesystemReadiness = {
  configured: boolean;
  issueCode: string | null;
};

export function obsidianVaultFilesystemReadiness(
  root = process.env.MARKORBIT_OBSIDIAN_VAULT_ROOT,
): ObsidianVaultFilesystemReadiness {
  const value = root?.trim();
  if (!value) {
    return { configured: false, issueCode: "OBSIDIAN_VAULT_ROOT_NOT_CONFIGURED" };
  }
  if (!isAbsolute(value)) {
    return { configured: false, issueCode: "OBSIDIAN_VAULT_ROOT_MUST_BE_ABSOLUTE" };
  }
  return { configured: true, issueCode: null };
}
