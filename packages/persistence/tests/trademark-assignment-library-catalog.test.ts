import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SqliteAiAssignmentLibraryRepository } from "../src/ai-assignment-library-registry";
import { SqliteAiKnowledgeAssignmentRepository } from "../src/ai-knowledge-assignment-registry";
import {
  AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  AU_TRADEMARK_INSTRUCTION_SET_ID,
  AU_TRADEMARK_LIBRARY_ASSIGNMENTS,
  AU_TRADEMARK_LIBRARY_WORKFLOWS,
} from "../src/au-trademark-assignment-library";
import {
  CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  CA_TRADEMARK_INSTRUCTION_SET_ID,
  CA_TRADEMARK_LIBRARY_ASSIGNMENTS,
  CA_TRADEMARK_LIBRARY_WORKFLOWS,
} from "../src/ca-trademark-assignment-library";
import {
  TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS,
  getTrademarkAssignmentLibraryMetadata,
  seedAllTrademarkAssignmentLibraries,
  seedTrademarkAssignmentLibrary,
} from "../src/trademark-assignment-library-catalog";
import { US_TRADEMARK_ASSIGNMENT_LIBRARY_ID } from "../src/us-trademark-assignment-library";

describe("ADK-10 multi-jurisdiction trademark assignment libraries", () => {
  it("seeds US, Australia and Canada as isolated durable libraries", () => {
    const database = new DatabaseSync(":memory:");
    const libraries = seedAllTrademarkAssignmentLibraries(database);
    const repository = new SqliteAiAssignmentLibraryRepository(database);

    expect(libraries.map((library) => library.jurisdiction)).toEqual(
      TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS,
    );
    expect(libraries.map((library) => library.libraryId)).toEqual([
      US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
      AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
      CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
    ]);
    expect(
      repository.listLatestLibrariesByScope({ jurisdiction: "AU", domain: "TRADEMARK" }),
    ).toEqual([libraries[1]]);
    expect(
      repository.listLatestLibrariesByScope({ jurisdiction: "CA", domain: "TRADEMARK" }),
    ).toEqual([libraries[2]]);
    database.close();
  });

  it("persists ten governed Australia workflows with one immutable instruction set", () => {
    const database = new DatabaseSync(":memory:");
    const library = seedTrademarkAssignmentLibrary(database, "AU");
    const repository = new SqliteAiAssignmentLibraryRepository(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);

    expect(library.entries.map((entry) => entry.workflow)).toEqual(AU_TRADEMARK_LIBRARY_WORKFLOWS);
    expect(library.entries).toHaveLength(10);
    for (const expected of AU_TRADEMARK_LIBRARY_ASSIGNMENTS) {
      const stored = assignments.getAssignment(expected.assignmentId);
      expect(stored).toEqual(expected);
      expect(stored?.instructionSetId).toBe(AU_TRADEMARK_INSTRUCTION_SET_ID);
      expect(stored?.prompt.length).toBeGreaterThan(100);
    }
    expect(repository.getLatestLibrary(AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID)).toEqual(library);
    database.close();
  });

  it("persists ten governed Canada workflows with one immutable instruction set", () => {
    const database = new DatabaseSync(":memory:");
    const library = seedTrademarkAssignmentLibrary(database, "CA");
    const repository = new SqliteAiAssignmentLibraryRepository(database);
    const assignments = new SqliteAiKnowledgeAssignmentRepository(database);

    expect(library.entries.map((entry) => entry.workflow)).toEqual(CA_TRADEMARK_LIBRARY_WORKFLOWS);
    expect(library.entries).toHaveLength(10);
    for (const expected of CA_TRADEMARK_LIBRARY_ASSIGNMENTS) {
      const stored = assignments.getAssignment(expected.assignmentId);
      expect(stored).toEqual(expected);
      expect(stored?.instructionSetId).toBe(CA_TRADEMARK_INSTRUCTION_SET_ID);
      expect(stored?.prompt.length).toBeGreaterThan(100);
    }
    expect(repository.getLatestLibrary(CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID)).toEqual(library);
    database.close();
  });

  it("is deterministic and idempotent when all jurisdiction libraries are bootstrapped twice", () => {
    const database = new DatabaseSync(":memory:");
    const first = seedAllTrademarkAssignmentLibraries(database);
    const second = seedAllTrademarkAssignmentLibraries(database);

    expect(second).toEqual(first);
    database.close();
  });

  it("exposes exact library metadata for each supported jurisdiction", () => {
    expect(getTrademarkAssignmentLibraryMetadata("US").libraryId).toBe(
      US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
    );
    expect(getTrademarkAssignmentLibraryMetadata("AU")).toEqual({
      libraryId: AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
      workflows: AU_TRADEMARK_LIBRARY_WORKFLOWS,
    });
    expect(getTrademarkAssignmentLibraryMetadata("CA")).toEqual({
      libraryId: CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
      workflows: CA_TRADEMARK_LIBRARY_WORKFLOWS,
    });
  });
});
