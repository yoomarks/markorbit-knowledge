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

export const CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID = "kal_ca_trademark_core";
export const CA_TRADEMARK_INSTRUCTION_SET_ID = "kis_ca_trademark_research_core";
export const CA_TRADEMARK_LIBRARY_CREATED_AT = "2026-08-24T01:30:00.000Z";

export const CA_TRADEMARK_LIBRARY_WORKFLOWS = [
  "FILING",
  "EXAMINATION",
  "EXAMINER_REPORT",
  "ADVERTISEMENT",
  "OPPOSITION",
  "REGISTRATION",
  "RENEWAL",
  "SECTION_45",
  "ASSIGNMENT",
  "MADRID",
] as const;

export const CA_TRADEMARK_RESEARCH_INSTRUCTION_SET: AiInstructionSetV1 = {
  protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: AI_INSTRUCTION_SET_OBJECT_TYPE,
  instructionSetId: CA_TRADEMARK_INSTRUCTION_SET_ID,
  revision: 1,
  name: "Canada Trademark Governed Research Core",
  purpose:
    "Produce source-grounded research for one governed Canadian trademark assignment without treating an AI answer as verified legal truth.",
  stableInstructions: [
    "Answer only the assigned Canadian trademark research question and identify the scope you covered.",
    "Prefer current CIPO, Trademarks Office, Trademarks Opposition Board, statute, regulation and other official primary sources; distinguish primary authority from commentary.",
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
  createdAt: CA_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-10 initial governed Canada Trademark Assignment Library",
  triggerEvidenceRefs: ["ADK-10"],
};

type SeedDefinition = {
  workflow: (typeof CA_TRADEMARK_LIBRARY_WORKFLOWS)[number];
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
    title: "Canada Trademark Filing",
    prompt:
      "Research the current CIPO Canadian trademark application filing lifecycle. Cover applicant and ownership requirements, representation of the trademark, goods and services description and Nice classification, priority claims, filing routes including Madrid designation where relevant, fees, filing receipts, common formal defects and the official sources needed to verify each branch.",
    tags: ["application", "filing", "classification", "priority"],
  },
  {
    workflow: "EXAMINATION",
    slug: "examination",
    topic: "EXAMINATION",
    title: "Canada Trademark Examination",
    prompt:
      "Research the current CIPO trademark examination lifecycle from filing through approval for advertisement or unresolved objection. Cover examiner review, registrability and formal requirements, goods and services objections, amendments, consent or evidence issues where relevant, suspension or extension mechanisms, abandonment risks and current official procedural sources.",
    tags: ["examination", "examiner", "registrability", "deadline"],
  },
  {
    workflow: "EXAMINER_REPORT",
    slug: "examiner_report",
    topic: "EXAMINER_REPORT",
    title: "Canada Trademark Examiner Report",
    prompt:
      "Research current CIPO practice for responding to a trademark examiner report. Cover common objection categories, response deadlines and extensions, amendment and argument options, evidence or consent where relevant, consequences of an insufficient response, withdrawal or abandonment risks, hearing or appeal pathways and the official sources governing the process.",
    tags: ["examiner-report", "response", "objection", "deadline"],
  },
  {
    workflow: "ADVERTISEMENT",
    slug: "advertisement",
    topic: "ADVERTISEMENT",
    title: "Canada Trademark Advertisement",
    prompt:
      "Research the current Canadian trademark advertisement stage after examination approval. Cover the purpose and legal effect of advertisement, publication channels, opposition exposure, correction or amendment issues, transition from advertisement toward registration and the current CIPO or Trademarks Office sources that govern the stage.",
    tags: ["advertisement", "publication", "opposition", "registration"],
  },
  {
    workflow: "OPPOSITION",
    slug: "opposition",
    topic: "OPPOSITION",
    title: "Canada Trademark Opposition",
    prompt:
      "Research current Canadian trademark opposition practice before the Trademarks Opposition Board. Cover statement-of-opposition timing and grounds, counter statement, evidence stages, cross-examination, written representations, hearings, extensions, settlement or withdrawal, default consequences, decisions and Federal Court review or appeal routes using current official sources.",
    tags: ["opposition", "tmob", "evidence", "appeal"],
  },
  {
    workflow: "REGISTRATION",
    slug: "registration",
    topic: "REGISTRATION",
    title: "Canada Trademark Registration",
    prompt:
      "Research the current Canadian trademark registration lifecycle after advertisement and any opposition period. Cover registration requirements, fees where applicable, certificate issuance, registration term, owner and goods or services scope, correction issues, post-registration obligations and the official sources needed to verify current practice.",
    tags: ["registration", "certificate", "registered-rights", "maintenance"],
  },
  {
    workflow: "RENEWAL",
    slug: "renewal",
    topic: "RENEWAL",
    title: "Canada Trademark Renewal",
    prompt:
      "Research current Canadian trademark renewal practice. Cover renewal cycles, ordinary and late filing windows, fees, class-based requirements, goods and services scope, owner information issues, expiry and restoration consequences where applicable, renewal of Madrid-based protection and current official CIPO sources.",
    tags: ["renewal", "maintenance", "deadline", "fees"],
  },
  {
    workflow: "SECTION_45",
    slug: "section_45",
    topic: "SECTION_45_PROCEEDING",
    title: "Canada Section 45 Proceedings",
    prompt:
      "Research current Canadian section 45 summary expungement proceedings. Cover when and how notice may issue, registrant evidence requirements, relevant period and use concepts, special circumstances, written representations and hearing practice, partial expungement or amendment outcomes, decisions and review or appeal routes using current official sources.",
    tags: ["section-45", "use", "expungement", "evidence"],
  },
  {
    workflow: "ASSIGNMENT",
    slug: "assignment",
    topic: "OWNERSHIP_ASSIGNMENT",
    title: "Canada Trademark Assignment and Ownership Changes",
    prompt:
      "Research current Canadian trademark assignment and ownership-change practice. Cover transfers of pending applications and registrations, chain-of-title evidence, recordal procedures, name or address changes, mergers or successor entities, corrections, timing risks and the distinction between register recordal and underlying ownership validity.",
    tags: ["assignment", "ownership", "recordal", "chain-of-title"],
  },
  {
    workflow: "MADRID",
    slug: "madrid",
    topic: "MADRID_PROTOCOL",
    title: "Canada Madrid Protocol Trademark Practice",
    prompt:
      "Research current Canadian practice for international registrations designating Canada under the Madrid Protocol. Cover designation entry, CIPO examination, provisional refusal and response, advertisement, opposition, protection status, holder changes and renewal interactions with WIPO, while distinguishing Canadian Office steps from International Bureau steps and citing current official sources.",
    tags: ["madrid", "wipo", "international-registration", "provisional-refusal"],
  },
];

export const CA_TRADEMARK_LIBRARY_ASSIGNMENTS: readonly AiKnowledgeAssignmentV1[] =
  SEED_DEFINITIONS.map((definition) => ({
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
    assignmentId: `kas_ca_trademark_${definition.slug}`,
    jurisdiction: "CA",
    domain: "TRADEMARK",
    topic: definition.topic,
    title: definition.title,
    instructionSetId: CA_TRADEMARK_INSTRUCTION_SET_ID,
    instructionSetRevision: 1,
    language: "en",
    prompt: definition.prompt,
    createdAt: CA_TRADEMARK_LIBRARY_CREATED_AT,
  }));

export const CA_TRADEMARK_ASSIGNMENT_LIBRARY: AiAssignmentLibraryV1 = {
  protocolVersion: AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION,
  objectType: AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE,
  libraryId: CA_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  revision: 1,
  title: "Canada Trademark Core Assignment Library",
  jurisdiction: "CA",
  domain: "TRADEMARK",
  entries: SEED_DEFINITIONS.map((definition, index) => ({
    sequence: index + 1,
    workflow: definition.workflow,
    assignmentId: `kas_ca_trademark_${definition.slug}`,
    tags: definition.tags,
  })),
  boundaries: {
    answerContentStored: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: CA_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-10 initial Canada Trademark proposition library",
};

export function seedCaTrademarkAssignmentLibrary(database: DatabaseSync): AiAssignmentLibraryV1 {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(CA_TRADEMARK_RESEARCH_INSTRUCTION_SET);
  for (const assignment of CA_TRADEMARK_LIBRARY_ASSIGNMENTS) {
    assignments.saveAssignment(assignment);
  }
  return new SqliteAiAssignmentLibraryRepository(database).saveLibrary(
    CA_TRADEMARK_ASSIGNMENT_LIBRARY,
  );
}
