import { DatabaseSync } from "node:sqlite";
import {
  AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE,
  AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION,
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_INSTRUCTION_SET_OBJECT_TYPE,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  type AiAssignmentLibraryV1,
  type AiInstructionSetV1,
  type AiKnowledgeAssignmentV1,
} from "@markorbit/contracts";
import { SqliteAiAssignmentLibraryRepository } from "./ai-assignment-library-registry";
import { SqliteAiKnowledgeAssignmentRepository } from "./ai-knowledge-assignment-registry";

export const AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID = "kal_au_trademark_core";
export const AU_TRADEMARK_INSTRUCTION_SET_ID = "kis_au_trademark_research_core";
export const AU_TRADEMARK_LIBRARY_CREATED_AT = "2026-08-24T01:00:00.000Z";

export const AU_TRADEMARK_LIBRARY_WORKFLOWS = [
  "FILING",
  "EXAMINATION",
  "ADVERSE_REPORT",
  "HEARING",
  "ACCEPTANCE",
  "OPPOSITION",
  "REGISTRATION_RENEWAL",
  "NON_USE_REMOVAL",
  "ASSIGNMENT",
  "MADRID",
] as const;

export const AU_TRADEMARK_RESEARCH_INSTRUCTION_SET: AiInstructionSetV1 = {
  protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: AI_INSTRUCTION_SET_OBJECT_TYPE,
  instructionSetId: AU_TRADEMARK_INSTRUCTION_SET_ID,
  revision: 1,
  name: "Australia Trademark Governed Research Core",
  purpose:
    "Produce source-grounded research for one governed Australian trademark assignment without treating an AI answer as verified legal truth.",
  stableInstructions: [
    "Answer only the assigned Australian trademark research question and identify the scope you covered.",
    "Prefer current IP Australia legislation, regulations, practice material, official forms and tribunal or court sources where relevant; distinguish primary authority from commentary.",
    "State dates, filing windows, fees, evidence requirements, exceptions and procedural branches only when supported by cited sources.",
    "Separate mandatory requirements from options, recommendations and fact-dependent judgment calls.",
    "Call out uncertainty, missing facts, historical-rule changes and situations that require professional review instead of guessing.",
    "Do not rank AI providers, certify legal truth, decide a client matter, or authorize any filing or protected action.",
    "Use concise Markdown with source references that a downstream reviewer can inspect.",
  ],
  requiredSections: [
    "Scope",
    "Governing authority",
    "Lifecycle and requirements",
    "Deadlines and timing",
    "Evidence and filing materials",
    "Fees and procedural options",
    "Exceptions and failure modes",
    "Official sources",
  ],
  outputFormat: "MARKDOWN",
  createdAt: AU_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-10 initial governed Australia Trademark Assignment Library",
  triggerEvidenceRefs: ["ADK-10"],
};

type SeedDefinition = {
  workflow: (typeof AU_TRADEMARK_LIBRARY_WORKFLOWS)[number];
  slug: string;
  topic: string;
  title: string;
  prompt: string;
  tags: readonly string[];
};

const SEED_DEFINITIONS: readonly SeedDefinition[] = [
  {
    workflow: "FILING",
    slug: "filing",
    topic: "APPLICATION_FILING",
    title: "Australia Trademark Filing",
    prompt:
      "Research the current IP Australia trade mark application filing lifecycle. Cover applicant and ownership requirements, representation of the mark, goods and services classification, filing routes, priority claims, series or convention issues where relevant, fees, filing receipts, common formal defects and the official sources needed to verify each branch.",
    tags: ["application", "filing", "classification", "priority"],
  },
  {
    workflow: "EXAMINATION",
    slug: "examination",
    topic: "EXAMINATION",
    title: "Australia Trademark Examination",
    prompt:
      "Research the current IP Australia trade mark examination lifecycle from filing through acceptance or unresolved objection. Cover examination sequence, registrability review, classification or specification issues, examiner correspondence, amendment pathways, deadlines, deferment or suspension mechanisms where available, abandonment or lapse risks and official procedural sources.",
    tags: ["examination", "registrability", "examiner", "deadline"],
  },
  {
    workflow: "ADVERSE_REPORT",
    slug: "adverse_report",
    topic: "ADVERSE_EXAMINATION_REPORT",
    title: "Australia Adverse Examination Report",
    prompt:
      "Research current practice for responding to an adverse IP Australia trade mark examination report. Cover common objection categories, response and amendment options, evidence that may be relevant, response timing, extension mechanisms, consequences of unresolved objections, escalation toward a hearing and current official guidance and legal authority.",
    tags: ["examination", "adverse-report", "response", "evidence"],
  },
  {
    workflow: "HEARING",
    slug: "hearing",
    topic: "EXAMINATION_HEARING",
    title: "Australia Trademark Examination Hearing",
    prompt:
      "Research the current IP Australia trade mark examination hearing pathway. Cover when a hearing may be requested or required, filing and evidence steps, written and oral hearing practice, decision issuance, costs or fees where applicable, review or appeal routes and the official sources governing the process.",
    tags: ["hearing", "examination", "decision", "appeal"],
  },
  {
    workflow: "ACCEPTANCE",
    slug: "acceptance",
    topic: "ACCEPTANCE_AND_REGISTRATION",
    title: "Australia Trademark Acceptance and Registration",
    prompt:
      "Research the current lifecycle after an Australian trade mark application is accepted. Cover publication of acceptance, opposition exposure, registration steps, any relevant waiting periods, registration date and term concepts, certification evidence, post-acceptance amendments or defects and the official sources needed to verify the current process.",
    tags: ["acceptance", "publication", "registration", "certificate"],
  },
  {
    workflow: "OPPOSITION",
    slug: "opposition",
    topic: "OPPOSITION",
    title: "Australia Trademark Opposition",
    prompt:
      "Research current Australian trade mark opposition practice. Cover the available opposition stages, notices and statements, deadlines, evidence rounds, extensions, hearings, settlement, costs, default or discontinuance, decision and review or appeal routes, while identifying the authoritative IP Australia and legislative sources for each step.",
    tags: ["opposition", "evidence", "hearing", "appeal"],
  },
  {
    workflow: "REGISTRATION_RENEWAL",
    slug: "registration_renewal",
    topic: "REGISTRATION_AND_RENEWAL",
    title: "Australia Trademark Registration and Renewal",
    prompt:
      "Research current Australian trade mark registration and renewal practice. Cover registration term, renewal timing, late or grace mechanisms, classes and goods or services scope, fees, restoration or expiry consequences where applicable, owner information changes relevant to renewal and the official sources governing maintenance of registration.",
    tags: ["registration", "renewal", "maintenance", "deadline"],
  },
  {
    workflow: "NON_USE_REMOVAL",
    slug: "non_use_removal",
    topic: "NON_USE_REMOVAL",
    title: "Australia Non-Use Removal Proceedings",
    prompt:
      "Research current Australian trade mark removal proceedings based on non-use. Cover eligibility and timing requirements, filing and service, opposition to removal, evidentiary burden and use evidence, discretion and partial removal issues, hearings, settlement, decisions and review or appeal routes using current official sources.",
    tags: ["non-use", "removal", "evidence", "registered-rights"],
  },
  {
    workflow: "ASSIGNMENT",
    slug: "assignment",
    topic: "OWNERSHIP_ASSIGNMENT",
    title: "Australia Trademark Assignment and Ownership Changes",
    prompt:
      "Research current Australian trade mark assignment and ownership-change practice. Cover transfers of pending applications and registrations, chain-of-title evidence, recordal requirements, merger or name-change distinctions, effective-date issues, corrections, security interests where relevant and the difference between register recordal and underlying ownership validity.",
    tags: ["assignment", "ownership", "recordal", "chain-of-title"],
  },
  {
    workflow: "MADRID",
    slug: "madrid",
    topic: "MADRID_PROTOCOL",
    title: "Australia Madrid Protocol Trademark Practice",
    prompt:
      "Research current Australian practice for international trade mark registrations designating Australia under the Madrid Protocol. Cover designation entry, examination, provisional refusal and response, acceptance, opposition, protection status, holder changes and renewal interactions with WIPO, while distinguishing IP Australia steps from International Bureau steps and citing current official sources.",
    tags: ["madrid", "wipo", "international-registration", "provisional-refusal"],
  },
];

export const AU_TRADEMARK_LIBRARY_ASSIGNMENTS: readonly AiKnowledgeAssignmentV1[] =
  SEED_DEFINITIONS.map((definition) => ({
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
    assignmentId: `kas_au_trademark_${definition.slug}`,
    jurisdiction: "AU",
    domain: "TRADEMARK",
    topic: definition.topic,
    title: definition.title,
    instructionSetId: AU_TRADEMARK_INSTRUCTION_SET_ID,
    instructionSetRevision: 1,
    language: "en",
    prompt: definition.prompt,
    createdAt: AU_TRADEMARK_LIBRARY_CREATED_AT,
  }));

export const AU_TRADEMARK_ASSIGNMENT_LIBRARY: AiAssignmentLibraryV1 = {
  protocolVersion: AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION,
  objectType: AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE,
  libraryId: AU_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  revision: 1,
  title: "Australia Trademark Core Assignment Library",
  jurisdiction: "AU",
  domain: "TRADEMARK",
  entries: SEED_DEFINITIONS.map((definition, index) => ({
    sequence: index + 1,
    workflow: definition.workflow,
    assignmentId: `kas_au_trademark_${definition.slug}`,
    tags: definition.tags,
  })),
  boundaries: {
    answerContentStored: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: AU_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-10 initial Australia Trademark proposition library",
};

export function seedAuTrademarkAssignmentLibrary(database: DatabaseSync): AiAssignmentLibraryV1 {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(AU_TRADEMARK_RESEARCH_INSTRUCTION_SET);
  for (const assignment of AU_TRADEMARK_LIBRARY_ASSIGNMENTS) {
    assignments.saveAssignment(assignment);
  }
  return new SqliteAiAssignmentLibraryRepository(database).saveLibrary(
    AU_TRADEMARK_ASSIGNMENT_LIBRARY,
  );
}
