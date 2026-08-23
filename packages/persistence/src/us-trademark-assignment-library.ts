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

export const US_TRADEMARK_ASSIGNMENT_LIBRARY_ID = "kal_us_trademark_core";
export const US_TRADEMARK_INSTRUCTION_SET_ID = "kis_us_trademark_research_core";
export const US_TRADEMARK_LIBRARY_CREATED_AT = "2026-08-24T00:00:00.000Z";

export const US_TRADEMARK_LIBRARY_WORKFLOWS = [
  "FILING",
  "EXAMINATION",
  "OFFICE_ACTION",
  "SECTION_8",
  "SECTION_9",
  "SECTION_15",
  "SECTION_71",
  "SPECIMEN",
  "ASSIGNMENT",
  "OPPOSITION",
  "CANCELLATION",
  "TTAB",
] as const;

export const US_TRADEMARK_RESEARCH_INSTRUCTION_SET: AiInstructionSetV1 = {
  protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: AI_INSTRUCTION_SET_OBJECT_TYPE,
  instructionSetId: US_TRADEMARK_INSTRUCTION_SET_ID,
  revision: 1,
  name: "US Trademark Governed Research Core",
  purpose:
    "Produce source-grounded research for one governed US trademark assignment without treating an AI answer as verified legal truth.",
  stableInstructions: [
    "Answer only the assigned US federal trademark research question and identify the scope you covered.",
    "Prefer current USPTO, TTAB, statute, rule and other official primary sources; distinguish primary authority from secondary commentary.",
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
  createdAt: US_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-08 initial governed US Trademark Assignment Library",
  triggerEvidenceRefs: ["ADK-08"],
};

type SeedDefinition = {
  workflow: (typeof US_TRADEMARK_LIBRARY_WORKFLOWS)[number];
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
    title: "US Trademark Filing",
    prompt:
      "Research the current USPTO federal trademark application filing lifecycle. Cover applicant/ownership requirements, mark formats, goods/services and classification, filing bases including Sections 1(a), 1(b), 44(d), 44(e) and Madrid Section 66(a) where relevant, signatures, fees, filing receipts, priority claims, common filing defects and the official sources needed to verify each branch.",
    tags: ["application", "filing-basis", "goods-services", "fees"],
  },
  {
    workflow: "EXAMINATION",
    slug: "examination",
    topic: "EXAMINATION",
    title: "US Trademark Examination",
    prompt:
      "Research the current USPTO examination lifecycle from application intake through publication or refusal. Cover examination sequence, examiner review, searches, substantive and formal requirements, examiner amendments, suspension, publication approval, abandonment risks, status monitoring and the official sources governing each stage.",
    tags: ["examination", "examiner", "publication", "suspension"],
  },
  {
    workflow: "OFFICE_ACTION",
    slug: "office_action",
    topic: "OFFICE_ACTION",
    title: "US Trademark Office Action",
    prompt:
      "Research current USPTO trademark Office Action practice. Distinguish nonfinal and final actions, common refusal and requirement categories, response deadlines and any extension mechanisms by filing basis, request-for-reconsideration and appeal interactions, examiner amendments, abandonment consequences, response evidence and official procedural sources.",
    tags: ["office-action", "refusal", "response", "deadline"],
  },
  {
    workflow: "SECTION_8",
    slug: "section_8",
    topic: "SECTION_8",
    title: "Section 8 Declaration of Use",
    prompt:
      "Research current Section 8 declaration of use or excusable nonuse requirements for US trademark registrations. Cover eligibility, ordinary and grace filing windows, goods/services maintenance and deletion, specimens, excusable nonuse, audits, deficiency correction, fees, cancellation consequences and current USPTO official sources.",
    tags: ["maintenance", "section-8", "use", "specimen"],
  },
  {
    workflow: "SECTION_9",
    slug: "section_9",
    topic: "SECTION_9",
    title: "Section 9 Renewal",
    prompt:
      "Research current Section 9 renewal requirements for US trademark registrations. Cover renewal cycles, ordinary and grace windows, relationship with Section 8 maintenance filings, classes and goods/services, fees, filing deficiencies, consequences of nonfiling and current USPTO official sources.",
    tags: ["maintenance", "section-9", "renewal", "deadline"],
  },
  {
    workflow: "SECTION_15",
    slug: "section_15",
    topic: "SECTION_15",
    title: "Section 15 Incontestability",
    prompt:
      "Research current Section 15 incontestability declaration practice. Cover statutory eligibility, continuous-use and timing conditions, proceedings or adverse decisions that affect eligibility, goods/services scope, filing mechanics, fees, legal effect and limitations, fact-dependent issues requiring professional review and current official sources.",
    tags: ["section-15", "incontestability", "eligibility", "registered-rights"],
  },
  {
    workflow: "SECTION_71",
    slug: "section_71",
    topic: "SECTION_71",
    title: "Section 71 Declaration for Madrid Registrations",
    prompt:
      "Research current Section 71 declarations for registered extensions of protection under the Madrid Protocol. Cover filing windows and grace periods, use or excusable nonuse, specimens, goods/services deletion, fees, later maintenance cycles, interaction with WIPO international-registration renewal and current USPTO official sources.",
    tags: ["madrid", "section-71", "maintenance", "use"],
  },
  {
    workflow: "SPECIMEN",
    slug: "specimen",
    topic: "SPECIMEN",
    title: "US Trademark Specimen Practice",
    prompt:
      "Research current USPTO trademark specimen practice for goods and services. Cover acceptable specimen types, point-of-sale and webpage evidence, URL/access-date requirements, service specimens, mockups and digitally altered images, common refusal grounds, substitute specimens and declarations, post-registration specimens, audit considerations and official examples or guidance.",
    tags: ["specimen", "use-in-commerce", "evidence", "webpage"],
  },
  {
    workflow: "ASSIGNMENT",
    slug: "assignment",
    topic: "OWNERSHIP_ASSIGNMENT",
    title: "US Trademark Assignment and Ownership Recordation",
    prompt:
      "Research current US trademark assignment and ownership recordation practice. Cover assignment versus name/address changes, chain of title, execution and recordation evidence, Assignment Center procedures, pending applications versus registrations, timing risks, successor entities, corrections and the distinction between recordation and underlying ownership validity.",
    tags: ["assignment", "ownership", "recordation", "chain-of-title"],
  },
  {
    workflow: "OPPOSITION",
    slug: "opposition",
    topic: "OPPOSITION",
    title: "US Trademark Opposition",
    prompt:
      "Research current TTAB opposition practice from publication through final disposition. Cover opposition and extension windows, standing/entitlement and pleading requirements, ESTTA filing, answer, discovery, trial evidence, motions, settlement, default, final decision, review or appeal routes, fees and authoritative TTAB/USPTO sources.",
    tags: ["ttab", "opposition", "publication", "inter-partes"],
  },
  {
    workflow: "CANCELLATION",
    slug: "cancellation",
    topic: "CANCELLATION",
    title: "US Trademark Cancellation Proceedings",
    prompt:
      "Research current TTAB petition-to-cancel practice. Cover available grounds and any timing limits, entitlement and pleading, ESTTA filing, answer, discovery, trial evidence, motions, settlement, default, final decision, review or appeal routes, interaction with registration age or maintenance status and authoritative sources.",
    tags: ["ttab", "cancellation", "registered-rights", "inter-partes"],
  },
  {
    workflow: "TTAB",
    slug: "ttab",
    topic: "TTAB_PROCEDURE",
    title: "TTAB Procedure and Practice",
    prompt:
      "Research the current procedural framework of the Trademark Trial and Appeal Board. Cover ESTTA, inter partes proceedings, discovery and disclosures, motions, testimony and notices of reliance, trial schedules, sanctions and defaults, suspension and settlement, appeals from examining attorneys, final decisions and judicial review, while identifying where opposition, cancellation and ex parte rules differ.",
    tags: ["ttab", "procedure", "discovery", "trial", "appeal"],
  },
];

export const US_TRADEMARK_LIBRARY_ASSIGNMENTS: readonly AiKnowledgeAssignmentV1[] =
  SEED_DEFINITIONS.map((definition) => ({
    protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
    objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
    assignmentId: `kas_us_trademark_${definition.slug}`,
    jurisdiction: "US",
    domain: "TRADEMARK",
    topic: definition.topic,
    title: definition.title,
    instructionSetId: US_TRADEMARK_INSTRUCTION_SET_ID,
    instructionSetRevision: 1,
    language: "en",
    prompt: definition.prompt,
    createdAt: US_TRADEMARK_LIBRARY_CREATED_AT,
  }));

export const US_TRADEMARK_ASSIGNMENT_LIBRARY: AiAssignmentLibraryV1 = {
  protocolVersion: AI_ASSIGNMENT_LIBRARY_PROTOCOL_VERSION,
  objectType: AI_ASSIGNMENT_LIBRARY_OBJECT_TYPE,
  libraryId: US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  revision: 1,
  title: "US Trademark Core Assignment Library",
  jurisdiction: "US",
  domain: "TRADEMARK",
  entries: SEED_DEFINITIONS.map((definition, index) => ({
    sequence: index + 1,
    workflow: definition.workflow,
    assignmentId: `kas_us_trademark_${definition.slug}`,
    tags: definition.tags,
  })),
  boundaries: {
    answerContentStored: false,
    executionAuthorityGranted: false,
    legalTruthVerified: false,
    candidateAutoActivation: false,
  },
  createdAt: US_TRADEMARK_LIBRARY_CREATED_AT,
  changeReason: "ADK-08 initial US Trademark proposition library",
};

export function seedUsTrademarkAssignmentLibrary(database: DatabaseSync): AiAssignmentLibraryV1 {
  const assignments = new SqliteAiKnowledgeAssignmentRepository(database);
  assignments.saveInstructionSet(US_TRADEMARK_RESEARCH_INSTRUCTION_SET);
  for (const assignment of US_TRADEMARK_LIBRARY_ASSIGNMENTS) {
    assignments.saveAssignment(assignment);
  }
  return new SqliteAiAssignmentLibraryRepository(database).saveLibrary(
    US_TRADEMARK_ASSIGNMENT_LIBRARY,
  );
}
