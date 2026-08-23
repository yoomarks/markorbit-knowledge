import type { DatabaseSync } from "node:sqlite";
import type { AiAssignmentLibraryV1 } from "@markorbit/contracts";
import {
  AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  AU_TRADEMARK_LIBRARY_WORKFLOWS,
  seedAuTrademarkAssignmentLibrary,
} from "./au-trademark-assignment-library";
import {
  CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  CA_TRADEMARK_LIBRARY_WORKFLOWS,
  seedCaTrademarkAssignmentLibrary,
} from "./ca-trademark-assignment-library";
import {
  US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  US_TRADEMARK_LIBRARY_WORKFLOWS,
  seedUsTrademarkAssignmentLibrary,
} from "./us-trademark-assignment-library";

export const TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS = ["US", "AU", "CA"] as const;
export type TrademarkAssignmentLibraryJurisdiction =
  (typeof TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS)[number];

const CATALOG = {
  US: {
    libraryId: US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
    workflows: US_TRADEMARK_LIBRARY_WORKFLOWS,
    seed: seedUsTrademarkAssignmentLibrary,
  },
  AU: {
    libraryId: AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
    workflows: AU_TRADEMARK_LIBRARY_WORKFLOWS,
    seed: seedAuTrademarkAssignmentLibrary,
  },
  CA: {
    libraryId: CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
    workflows: CA_TRADEMARK_LIBRARY_WORKFLOWS,
    seed: seedCaTrademarkAssignmentLibrary,
  },
} as const;

export function isTrademarkAssignmentLibraryJurisdiction(
  value: string,
): value is TrademarkAssignmentLibraryJurisdiction {
  return (TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS as readonly string[]).includes(value);
}

export function seedTrademarkAssignmentLibrary(
  database: DatabaseSync,
  jurisdiction: TrademarkAssignmentLibraryJurisdiction,
): AiAssignmentLibraryV1 {
  return CATALOG[jurisdiction].seed(database);
}

export function getTrademarkAssignmentLibraryMetadata(
  jurisdiction: TrademarkAssignmentLibraryJurisdiction,
): { libraryId: string; workflows: readonly string[] } {
  const entry = CATALOG[jurisdiction];
  return { libraryId: entry.libraryId, workflows: entry.workflows };
}

export function seedAllTrademarkAssignmentLibraries(
  database: DatabaseSync,
): AiAssignmentLibraryV1[] {
  return TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS.map((jurisdiction) =>
    seedTrademarkAssignmentLibrary(database, jurisdiction),
  );
}
