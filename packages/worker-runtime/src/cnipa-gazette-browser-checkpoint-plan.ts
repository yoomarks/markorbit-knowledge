import { CNIPA_GAZETTE_MAX_PAGES_PER_CHECKPOINT } from "./cnipa-gazette-checkpoint-runtime";

export type CnipaGazetteBrowserCheckpointRangePlan = {
  logicalRange: {
    startPage: number;
    endPage: number;
  };
  sourceRange: {
    startPage: number;
    endPage: number;
  };
  terminal: boolean;
};

function positiveInteger(value: number, label: string, maximum?: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    throw new TypeError(
      maximum === undefined
        ? `${label} must be a positive safe integer`
        : `${label} must be an integer from 1 to ${maximum}`,
    );
  }
  return value;
}
function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

export function cnipaGazetteBrowserCheckpointAlignment(sourcePageSize: number): number {
  const pageSize = positiveInteger(sourcePageSize, "sourcePageSize", 100);
  return pageSize / gcd(pageSize, 100);
}
export function cnipaGazetteBrowserEffectiveCheckpointPages(input: {
  sourcePageSize: number;
  targetLogicalPagesPerCheckpoint?: number;
}): number {
  const alignment = cnipaGazetteBrowserCheckpointAlignment(input.sourcePageSize);
  const target = positiveInteger(
    input.targetLogicalPagesPerCheckpoint ?? 25,
    "targetLogicalPagesPerCheckpoint",
    CNIPA_GAZETTE_MAX_PAGES_PER_CHECKPOINT,
  );
  if (target < alignment) return alignment;
  return Math.floor(target / alignment) * alignment;
}

export function planCnipaGazetteBrowserCheckpointRanges(input: {
  sourceTotal: number;
  sourcePageSize: number;
  targetLogicalPagesPerCheckpoint?: number;
}): readonly CnipaGazetteBrowserCheckpointRangePlan[] {
  const sourceTotal = nonNegativeInteger(input.sourceTotal, "sourceTotal");
  const sourcePageSize = positiveInteger(input.sourcePageSize, "sourcePageSize", 100);
  const effectiveLogicalPages = cnipaGazetteBrowserEffectiveCheckpointPages({
    sourcePageSize,
    ...(input.targetLogicalPagesPerCheckpoint !== undefined
      ? {
          targetLogicalPagesPerCheckpoint: input.targetLogicalPagesPerCheckpoint,
        }
      : {}),
  });
  const logicalPageCount = Math.max(1, Math.ceil(sourceTotal / 100));
  const sourcePageCount = Math.max(1, Math.ceil(sourceTotal / sourcePageSize));
  const ranges: CnipaGazetteBrowserCheckpointRangePlan[] = [];

  for (
    let logicalStart = 1;
    logicalStart <= logicalPageCount;
    logicalStart += effectiveLogicalPages
  ) {
    const logicalEnd = Math.min(logicalPageCount, logicalStart + effectiveLogicalPages - 1);
    const startRow = (logicalStart - 1) * 100;
    const endRowExclusive = Math.min(sourceTotal, logicalEnd * 100);
    const sourceStart = sourceTotal === 0 ? 1 : Math.floor(startRow / sourcePageSize) + 1;
    const sourceEnd =
      sourceTotal === 0 ? 1 : Math.max(sourceStart, Math.ceil(endRowExclusive / sourcePageSize));
    if (logicalEnd < logicalPageCount && endRowExclusive % sourcePageSize !== 0) {
      throw new Error("non-terminal browser checkpoint must end on a source-page boundary");
    }
    if (sourceEnd > sourcePageCount) {
      throw new Error("browser checkpoint source range exceeds sourcePageCount");
    }
    ranges.push({
      logicalRange: { startPage: logicalStart, endPage: logicalEnd },
      sourceRange: { startPage: sourceStart, endPage: sourceEnd },
      terminal: logicalEnd === logicalPageCount,
    });
  }
  return ranges;
}
