import { describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserCheckpointAlignment,
  cnipaGazetteBrowserEffectiveCheckpointPages,
  planCnipaGazetteBrowserCheckpointRanges,
} from "./cnipa-gazette-browser-checkpoint-plan";

describe("CNIPA Gazette browser checkpoint alignment", () => {
  it("finds the smallest logical-page span that also ends on a source-page boundary", () => {
    expect(cnipaGazetteBrowserCheckpointAlignment(10)).toBe(1);
    expect(cnipaGazetteBrowserCheckpointAlignment(30)).toBe(3);
    expect(cnipaGazetteBrowserCheckpointAlignment(64)).toBe(16);
    expect(cnipaGazetteBrowserCheckpointAlignment(99)).toBe(99);
    expect(cnipaGazetteBrowserCheckpointAlignment(100)).toBe(1);
  });

  it("keeps the configured target when aligned and rounds down to a safe multiple", () => {
    expect(
      cnipaGazetteBrowserEffectiveCheckpointPages({
        sourcePageSize: 10,
        targetLogicalPagesPerCheckpoint: 25,
      }),
    ).toBe(25);
    expect(
      cnipaGazetteBrowserEffectiveCheckpointPages({
        sourcePageSize: 30,
        targetLogicalPagesPerCheckpoint: 25,
      }),
    ).toBe(24);
    expect(
      cnipaGazetteBrowserEffectiveCheckpointPages({
        sourcePageSize: 64,
        targetLogicalPagesPerCheckpoint: 25,
      }),
    ).toBe(16);
    expect(
      cnipaGazetteBrowserEffectiveCheckpointPages({
        sourcePageSize: 99,
        targetLogicalPagesPerCheckpoint: 25,
      }),
    ).toBe(99);
  });

  it("plans source and logical ranges with empty tails at non-terminal checkpoints", () => {
    expect(
      planCnipaGazetteBrowserCheckpointRanges({
        sourceTotal: 650,
        sourcePageSize: 30,
        targetLogicalPagesPerCheckpoint: 3,
      }),
    ).toEqual([
      {
        logicalRange: { startPage: 1, endPage: 3 },
        sourceRange: { startPage: 1, endPage: 10 },
        terminal: false,
      },
      {
        logicalRange: { startPage: 4, endPage: 6 },
        sourceRange: { startPage: 11, endPage: 20 },
        terminal: false,
      },
      {
        logicalRange: { startPage: 7, endPage: 7 },
        sourceRange: { startPage: 21, endPage: 22 },
        terminal: true,
      },
    ]);
  });

  it("allows a terminal partial range because the terminal source page flushes the tail", () => {
    expect(
      planCnipaGazetteBrowserCheckpointRanges({
        sourceTotal: 250,
        sourcePageSize: 30,
        targetLogicalPagesPerCheckpoint: 3,
      }),
    ).toEqual([
      {
        logicalRange: { startPage: 1, endPage: 3 },
        sourceRange: { startPage: 1, endPage: 9 },
        terminal: true,
      },
    ]);
  });

  it("fails closed on unsupported page sizes or checkpoint targets", () => {
    expect(() => cnipaGazetteBrowserCheckpointAlignment(0)).toThrow();
    expect(() => cnipaGazetteBrowserCheckpointAlignment(101)).toThrow();
    expect(() =>
      cnipaGazetteBrowserEffectiveCheckpointPages({
        sourcePageSize: 10,
        targetLogicalPagesPerCheckpoint: 101,
      }),
    ).toThrow();
  });
});
