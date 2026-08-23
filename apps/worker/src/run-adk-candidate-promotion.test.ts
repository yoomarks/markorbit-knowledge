import { describe, expect, it } from "vitest";
import {
  loadAdkCandidatePromotionConfig,
  parseAdkCandidatePromotionPlan,
} from "./run-adk-candidate-promotion";

describe("ADK candidate promotion operator command", () => {
  it("loads explicit database and frozen promotion plan paths", () => {
    const config = loadAdkCandidatePromotionConfig({
      MARKORBIT_ADK_LIBRARY_DB_PATH: "./var/adk.sqlite",
      MARKORBIT_ADK_PROMOTION_PLAN_PATH: "./var/promotion.json",
    });

    expect(config.databasePath).toMatch(/var\/adk\.sqlite$/u);
    expect(config.planPath).toMatch(/var\/promotion\.json$/u);
  });

  it("parses an exact governed promotion plan", () => {
    expect(
      parseAdkCandidatePromotionPlan({
        promotionId: "kap_us_trademark_specimen_follow_up",
        candidateId: "kac_us_trademark_specimen_follow_up",
        approvalRef: "approval/adk-09/specimen-follow-up",
        approvedBy: "knowledge-operator",
        targetAssignmentId: "kas_us_trademark_specimen_follow_up",
        libraryId: "kal_us_trademark_core",
        baseLibraryRevision: 1,
        workflow: "SPECIMEN",
        tags: ["specimen", "evidence"],
        promotedAt: "2026-08-24T01:00:00.000Z",
      }),
    ).toEqual({
      promotionId: "kap_us_trademark_specimen_follow_up",
      candidateId: "kac_us_trademark_specimen_follow_up",
      approvalRef: "approval/adk-09/specimen-follow-up",
      approvedBy: "knowledge-operator",
      targetAssignmentId: "kas_us_trademark_specimen_follow_up",
      libraryId: "kal_us_trademark_core",
      baseLibraryRevision: 1,
      workflow: "SPECIMEN",
      tags: ["specimen", "evidence"],
      promotedAt: "2026-08-24T01:00:00.000Z",
    });
  });

  it("rejects missing approval metadata and unknown plan fields", () => {
    expect(() =>
      parseAdkCandidatePromotionPlan({
        promotionId: "kap_us_trademark_specimen_follow_up",
        candidateId: "kac_us_trademark_specimen_follow_up",
        approvalRef: "",
        approvedBy: "knowledge-operator",
        targetAssignmentId: "kas_us_trademark_specimen_follow_up",
        libraryId: "kal_us_trademark_core",
        baseLibraryRevision: 1,
        workflow: "SPECIMEN",
        tags: ["specimen"],
        promotedAt: "2026-08-24T01:00:00.000Z",
      }),
    ).toThrowError(/Invalid ADK candidate promotion plan/u);

    expect(() =>
      parseAdkCandidatePromotionPlan({
        promotionId: "kap_us_trademark_specimen_follow_up",
        candidateId: "kac_us_trademark_specimen_follow_up",
        approvalRef: "approval/adk-09/specimen-follow-up",
        approvedBy: "knowledge-operator",
        targetAssignmentId: "kas_us_trademark_specimen_follow_up",
        libraryId: "kal_us_trademark_core",
        baseLibraryRevision: 1,
        workflow: "SPECIMEN",
        tags: ["specimen"],
        promotedAt: "2026-08-24T01:00:00.000Z",
        autoExecute: true,
      }),
    ).toThrowError(/Invalid ADK candidate promotion plan/u);
  });
});
