import type { CorpusDefinition } from "./corpus-inventory";

export const IP_AUSTRALIA_GOLDEN_CORPUS: CorpusDefinition = {
  id: "ip-australia-trademark-public-knowledge",
  displayName: "IP Australia Trademark Public Knowledge Corpus",
  archetype: "SINGLE_JURISDICTION_KNOWLEDGE_SYSTEM",
  publicScope: [
    "public trademark user-journey guidance from search through application, examination, opposition, registration and renewal",
    "public ownership, assignment, licensing, non-use, forms and online-service guidance",
    "public Trade Marks Manual of Practice and Procedure, including published and amended metadata",
    "public fees, timeframes and service-level information",
  ],
  excludedScope: [
    "non-public IP Australia internal material",
    "development or non-production site content",
  ],
  discoveryHosts: ["ipaustralia.gov.au", "www.ipaustralia.gov.au", "manuals.ipaustralia.gov.au"],
  domains: [
    { id: "basics", label: "Trade mark basics", matchAny: ["trade marks", "trademark basics"] },
    {
      id: "search",
      label: "Search and availability",
      matchAny: ["search existing", "trade mark search"],
    },
    {
      id: "fees-timeframes",
      label: "Fees and timeframes",
      matchAny: ["timeframes and fees", "fees", "timeliness"],
    },
    {
      id: "apply",
      label: "Application journey",
      matchAny: ["how to apply", "application", "tm headstart", "tm checker"],
    },
    {
      id: "examination",
      label: "Examination response",
      matchAny: ["examination report", "examination"],
    },
    { id: "opposition", label: "Opposition and hearings", matchAny: ["opposition", "hearing"] },
    {
      id: "renewal",
      label: "Registration and renewal",
      matchAny: ["renew", "renewal", "registration"],
    },
    {
      id: "ownership",
      label: "Ownership and commercialisation",
      matchAny: ["assign ownership", "assignment", "license", "licence"],
    },
    { id: "non-use", label: "Non-use and challenge procedures", matchAny: ["non-use", "removal"] },
    {
      id: "forms-systems",
      label: "Forms and online systems",
      matchAny: ["form", "online services", "tm checker"],
    },
    {
      id: "practice-manual",
      label: "Trade Marks Manual of Practice and Procedure",
      matchAny: ["manual of practice", "manuals.ipaustralia", "part 4", "part 48"],
    },
    {
      id: "updates",
      label: "Updates and service levels",
      matchAny: ["timeliness", "service level", "last updated", "amended reasons"],
    },
  ],
};
