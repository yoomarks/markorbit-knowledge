import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "@markorbit/persistence";
import { getKnowledgePlatformAdministrationOwnerView } from "./control-plane-platform-administration-owner";

const OBSERVED_AT = new Date("2026-09-16T10:00:00.000Z");

describe("getKnowledgePlatformAdministrationOwnerView", () => {
  it("returns the canonical read-only platform operations portfolio", () => {
    const database = openRegistryDatabase(":memory:");
    try {
      const result = getKnowledgePlatformAdministrationOwnerView(OBSERVED_AT, database, 1234);
      expect(result.schemaVersion).toBe(1);
      expect(result.objectType).toBe("KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT");
      expect(result.owner).toBe("KNOWLEDGE");
      expect(result.access).toBe("READ_ONLY");
      expect(result.requiredUpstreamAuthority).toBe("control-plane:knowledge:read");
      expect(result.observedAt).toBe(OBSERVED_AT.toISOString());
      expect(result.portfolio.availability).toBe("AVAILABLE");
      expect(result.portfolio.facts.workspaces.total).toBe(1);
      expect(result.portfolio.facts.storage.walBytes).toBe(1234);
      expect(result.portfolio.facts.storage.envelope.migrationAuthorized).toBe(false);
      expect(result.portfolio.facts.storage.envelope.reasonCodes).toEqual([
        "BACKUP_EVIDENCE_MISSING",
        "RESTORE_DRILL_EVIDENCE_MISSING",
        "RESTORE_THROUGHPUT_EVIDENCE_MISSING",
      ]);
    } finally {
      database.close();
    }
  });

  it("exposes operational facts without mutation, recommendation or legal semantics", () => {
    const database = openRegistryDatabase(":memory:");
    try {
      const result = getKnowledgePlatformAdministrationOwnerView(OBSERVED_AT, database, 0);
      const serialized = JSON.stringify(result);
      for (const forbidden of [
        "adminSession",
        "secret",
        "recommendation",
        "legalConclusion",
        "mutationGuidance",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      database.close();
    }
  });
});
