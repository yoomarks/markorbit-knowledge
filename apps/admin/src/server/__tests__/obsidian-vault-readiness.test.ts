import { describe, expect, it } from "vitest";
import { obsidianVaultFilesystemReadiness } from "../obsidian-vault-readiness";

describe("Obsidian Vault filesystem readiness", () => {
  it("fails closed when the server root is absent", () => {
    expect(obsidianVaultFilesystemReadiness(undefined)).toEqual({
      configured: false,
      issueCode: "OBSIDIAN_VAULT_ROOT_NOT_CONFIGURED",
    });
  });

  it("requires an absolute server-controlled root", () => {
    expect(obsidianVaultFilesystemReadiness(".data/vault")).toEqual({
      configured: false,
      issueCode: "OBSIDIAN_VAULT_ROOT_MUST_BE_ABSOLUTE",
    });
  });

  it("reports only readiness for a valid absolute root", () => {
    expect(obsidianVaultFilesystemReadiness("/srv/markorbit-vault")).toEqual({
      configured: true,
      issueCode: null,
    });
  });
});
