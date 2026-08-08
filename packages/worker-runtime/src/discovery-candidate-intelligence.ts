export const DISCOVERY_TOPICS = [
  "TRADEMARKS",
  "SEARCH",
  "FEES",
  "FORMS",
  "GUIDANCE",
  "LEGAL",
  "NEWS",
  "CONTACTS",
  "ABOUT",
  "GENERAL",
] as const;

export type DiscoveryTopic = (typeof DISCOVERY_TOPICS)[number];

export const DISCOVERY_REVIEW_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type DiscoveryReviewPriority = (typeof DISCOVERY_REVIEW_PRIORITIES)[number];

export const DISCOVERY_REASON_CODES = [
  "TRADEMARK_SIGNAL",
  "SEARCH_SIGNAL",
  "FEE_SIGNAL",
  "FORM_SIGNAL",
  "GUIDANCE_SIGNAL",
  "LEGAL_SIGNAL",
  "NEWS_SIGNAL",
  "CONTACT_SIGNAL",
  "ABOUT_SIGNAL",
  "DOCUMENT_SIGNAL",
  "SITEMAP_SIGNAL",
  "SHALLOW_SIGNAL",
  "ROBOTS_BLOCKED",
  "UTILITY_PAGE",
] as const;

export type DiscoveryReasonCode = (typeof DISCOVERY_REASON_CODES)[number];

export type DiscoveryCandidateIntelligenceInput = {
  locator: string;
  label?: string;
  method?: "SEED" | "HTML_LINK" | "SITEMAP" | "FEED" | "CITATION" | "MANUAL";
  kind?: "PAGE" | "DOCUMENT" | "FEED";
  depth?: number;
  robotsAllowed?: boolean;
};

export type DiscoveryCandidateIntelligence = {
  topic: DiscoveryTopic;
  relevanceScore: number;
  reviewPriority: DiscoveryReviewPriority;
  reasonCodes: DiscoveryReasonCode[];
};

type TopicSignal = {
  topic: DiscoveryTopic;
  score: number;
  reason: DiscoveryReasonCode;
  pattern: RegExp;
};

const TOPIC_SIGNALS: TopicSignal[] = [
  {
    topic: "TRADEMARKS",
    score: 38,
    reason: "TRADEMARK_SIGNAL",
    pattern:
      /\b(trademark|trade mark|brand|register(?:ing|ed|ation)?|application|filing|goods and services|nice class|classification|identification of goods|specimen|statement of use)\b/i,
  },
  {
    topic: "SEARCH",
    score: 35,
    reason: "SEARCH_SIGNAL",
    pattern: /\b(search|database|lookup|tess|tmsearch|status|tmds|assignment search)\b/i,
  },
  {
    topic: "FEES",
    score: 34,
    reason: "FEE_SIGNAL",
    pattern: /\b(fee|fees|payment|cost|pricing|schedule of fees)\b/i,
  },
  {
    topic: "FORMS",
    score: 32,
    reason: "FORM_SIGNAL",
    pattern: /\b(form|forms|filing form|petition form|application form)\b/i,
  },
  {
    topic: "GUIDANCE",
    score: 34,
    reason: "GUIDANCE_SIGNAL",
    pattern:
      /\b(guide|guidance|manual|tmep|policy|procedure|practice|faq|frequently asked|how to|requirements?|instructions?)\b/i,
  },
  {
    topic: "LEGAL",
    score: 34,
    reason: "LEGAL_SIGNAL",
    pattern:
      /\b(law|laws|statute|regulation|rule|rules|decision|case|appeal|opposition|cancellation|ttab|court|precedent)\b/i,
  },
  {
    topic: "NEWS",
    score: 16,
    reason: "NEWS_SIGNAL",
    pattern: /\b(news|press|announcement|update|bulletin|gazette|journal|notice)\b/i,
  },
  {
    topic: "CONTACTS",
    score: 8,
    reason: "CONTACT_SIGNAL",
    pattern: /\b(contact|directory|staff|people|attorney|lawyer|team|office locations?)\b/i,
  },
  {
    topic: "ABOUT",
    score: 4,
    reason: "ABOUT_SIGNAL",
    pattern: /\b(about|mission|leadership|history|careers?|procurement|accessibility)\b/i,
  },
];

const UTILITY_PATTERN =
  /\b(login|sign in|signin|logout|account|cart|privacy|cookie|accessibility|careers?|procurement|sitemap)\b/i;

function compactText(value: string): string {
  return value
    .replace(/[-_/.?=&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function priorityFor(score: number, robotsAllowed: boolean): DiscoveryReviewPriority {
  if (!robotsAllowed) return "LOW";
  if (score >= 70) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

/**
 * Produces deterministic, explainable review hints for a discovered URL.
 *
 * This is discovery triage, not professional judgment. The score only helps an
 * operator decide what to inspect first; it must never be interpreted as legal
 * authority, truth, or a reason to bypass the human review gate.
 */
export function classifyDiscoveryCandidate(
  input: DiscoveryCandidateIntelligenceInput,
): DiscoveryCandidateIntelligence {
  const url = new URL(input.locator);
  const searchable = compactText(`${url.pathname} ${url.search} ${input.label ?? ""}`);
  const reasonCodes: DiscoveryReasonCode[] = [];
  let score = 28;
  let topic: DiscoveryTopic = "GENERAL";
  let bestTopicScore = -1;

  for (const signal of TOPIC_SIGNALS) {
    if (!signal.pattern.test(searchable)) continue;
    score += signal.score;
    reasonCodes.push(signal.reason);
    if (signal.score > bestTopicScore) {
      bestTopicScore = signal.score;
      topic = signal.topic;
    }
  }

  if (input.kind === "DOCUMENT") {
    score += 12;
    reasonCodes.push("DOCUMENT_SIGNAL");
  }

  if (input.method === "SITEMAP") {
    score += 6;
    reasonCodes.push("SITEMAP_SIGNAL");
  }

  if ((input.depth ?? 0) <= 1) {
    score += 5;
    reasonCodes.push("SHALLOW_SIGNAL");
  }

  if (UTILITY_PATTERN.test(searchable)) {
    score -= 35;
    reasonCodes.push("UTILITY_PAGE");
  }

  const robotsAllowed = input.robotsAllowed ?? true;
  if (!robotsAllowed) {
    score = Math.min(score, 20);
    reasonCodes.push("ROBOTS_BLOCKED");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    topic,
    relevanceScore: score,
    reviewPriority: priorityFor(score, robotsAllowed),
    reasonCodes: [...new Set(reasonCodes)],
  };
}
