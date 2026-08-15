from pathlib import Path

schema = Path("packages/contracts/src/schema-v1.ts")
text = schema.read_text()
old = '''export const SCHEMA_V1_VERSION = "1.0" as const;
export const CRAWL4AI_MAX_START_URLS = 500;
'''
new = '''export const SCHEMA_V1_VERSION = "1.0" as const;
export const CRAWL4AI_MAX_START_URLS = 500;
export const CRAWL4AI_MAX_DEPTH = 5;
export const CRAWL4AI_MAX_ITEMS = 500;
export const CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE = 600;
export const CRAWL4AI_MAX_TIMEOUT_SECONDS = 300;
export const CRAWL4AI_MAX_PATTERNS_PER_LIST = 100;
export const CRAWL4AI_MAX_PATTERN_LENGTH = 500;
export const CRAWL4AI_MAX_LOCALE_LENGTH = 64;
'''
if text.count(old) != 1:
    raise SystemExit(f"schema Crawl4AI constants anchor count={text.count(old)}")
schema.write_text(text.replace(old, new, 1))

plan_path = Path("packages/persistence/src/collection-plan-registry.ts")
text = plan_path.read_text()
old = '''  ARTIFACT_KINDS,
  COLLECTION_PLAN_STATUSES,
  COLLECTION_PRIORITIES,
  SCHEMA_V1_VERSION,
'''
new = '''  ARTIFACT_KINDS,
  COLLECTION_PLAN_STATUSES,
  COLLECTION_PRIORITIES,
  CRAWL4AI_MAX_DEPTH,
  CRAWL4AI_MAX_ITEMS,
  CRAWL4AI_MAX_LOCALE_LENGTH,
  CRAWL4AI_MAX_PATTERN_LENGTH,
  CRAWL4AI_MAX_PATTERNS_PER_LIST,
  CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
  CRAWL4AI_MAX_TIMEOUT_SECONDS,
  SCHEMA_V1_VERSION,
'''
if text.count(old) != 1:
    raise SystemExit(f"plan import anchor count={text.count(old)}")
text = text.replace(old, new, 1)

anchor = '''function validateCompatibility(
  plan: CollectionPlan,
  source: SourceDefinition,
  connector: ConnectorManifest,
): void {
'''
addition = '''function validateCrawl4AiPolicy(plan: CollectionPlan, connector: ConnectorManifest): void {
  if (connector.connectorId !== "crawl4ai-web") return;
  const violations: Array<{ field: string; actual: number; maximum: number }> = [];
  const policy = plan.policy;
  if (policy.maxDepth > CRAWL4AI_MAX_DEPTH) {
    violations.push({ field: "maxDepth", actual: policy.maxDepth, maximum: CRAWL4AI_MAX_DEPTH });
  }
  if (policy.maxItems > CRAWL4AI_MAX_ITEMS) {
    violations.push({ field: "maxItems", actual: policy.maxItems, maximum: CRAWL4AI_MAX_ITEMS });
  }
  if (policy.rateLimitPerMinute > CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE) {
    violations.push({
      field: "rateLimitPerMinute",
      actual: policy.rateLimitPerMinute,
      maximum: CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
    });
  }
  if (policy.timeoutSeconds > CRAWL4AI_MAX_TIMEOUT_SECONDS) {
    violations.push({
      field: "timeoutSeconds",
      actual: policy.timeoutSeconds,
      maximum: CRAWL4AI_MAX_TIMEOUT_SECONDS,
    });
  }
  if (policy.includePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST) {
    violations.push({
      field: "includePatterns.length",
      actual: policy.includePatterns.length,
      maximum: CRAWL4AI_MAX_PATTERNS_PER_LIST,
    });
  }
  if (policy.excludePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST) {
    violations.push({
      field: "excludePatterns.length",
      actual: policy.excludePatterns.length,
      maximum: CRAWL4AI_MAX_PATTERNS_PER_LIST,
    });
  }
  const longestPattern = Math.max(
    0,
    ...policy.includePatterns.map((pattern) => pattern.length),
    ...policy.excludePatterns.map((pattern) => pattern.length),
  );
  if (longestPattern > CRAWL4AI_MAX_PATTERN_LENGTH) {
    violations.push({
      field: "pattern.length",
      actual: longestPattern,
      maximum: CRAWL4AI_MAX_PATTERN_LENGTH,
    });
  }
  if (policy.locale && policy.locale.length > CRAWL4AI_MAX_LOCALE_LENGTH) {
    violations.push({
      field: "locale.length",
      actual: policy.locale.length,
      maximum: CRAWL4AI_MAX_LOCALE_LENGTH,
    });
  }
  if (violations.length === 0) return;
  throw new RegistryConflictError(
    "COLLECTION_PLAN_CRAWL4AI_POLICY_MISMATCH",
    "Collection plan exceeds the governed Crawl4AI runtime policy boundary",
    { connectorId: connector.connectorId, violations },
  );
}

'''
if text.count(anchor) != 1:
    raise SystemExit(f"compatibility anchor count={text.count(anchor)}")
text = text.replace(anchor, addition + anchor, 1)
old = '''  if (!connector.sourceTypes.includes(source.sourceType)) {
'''
new = '''  validateCrawl4AiPolicy(plan, connector);

  if (!connector.sourceTypes.includes(source.sourceType)) {
'''
# only replace inside validateCompatibility; unique currently likely 1
if text.count(old) != 1:
    raise SystemExit(f"compatibility body anchor count={text.count(old)}")
text = text.replace(old, new, 1)
plan_path.write_text(text)

worker_path = Path("packages/worker-runtime/src/crawl4ai-subprocess-acquirer.ts")
text = worker_path.read_text()
old = '''  CRAWL4AI_MAX_START_URLS,
  type ArtifactKind,
'''
new = '''  CRAWL4AI_MAX_DEPTH,
  CRAWL4AI_MAX_ITEMS,
  CRAWL4AI_MAX_LOCALE_LENGTH,
  CRAWL4AI_MAX_PATTERN_LENGTH,
  CRAWL4AI_MAX_PATTERNS_PER_LIST,
  CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE,
  CRAWL4AI_MAX_START_URLS,
  CRAWL4AI_MAX_TIMEOUT_SECONDS,
  type ArtifactKind,
'''
if text.count(old) != 1:
    raise SystemExit(f"worker import anchor count={text.count(old)}")
text = text.replace(old, new, 1)

old = '''  if (job.planSnapshot.policy.maxItems > maxItems) {
    throw new CollectionAcquisitionError(
      "CRAWL_ITEM_LIMIT_EXCEEDED",
      `CollectionPlan maxItems ${job.planSnapshot.policy.maxItems} exceeds Worker limit ${maxItems}`,
      false,
    );
  }
  const urls = startUrls(context);
'''
new = '''  if (job.planSnapshot.policy.maxItems > maxItems) {
    throw new CollectionAcquisitionError(
      "CRAWL_ITEM_LIMIT_EXCEEDED",
      `CollectionPlan maxItems ${job.planSnapshot.policy.maxItems} exceeds Worker limit ${maxItems}`,
      false,
    );
  }
  const policy = job.planSnapshot.policy;
  const invalidPolicy =
    policy.maxDepth > CRAWL4AI_MAX_DEPTH ||
    policy.maxItems > CRAWL4AI_MAX_ITEMS ||
    policy.rateLimitPerMinute > CRAWL4AI_MAX_RATE_LIMIT_PER_MINUTE ||
    policy.timeoutSeconds > CRAWL4AI_MAX_TIMEOUT_SECONDS ||
    policy.includePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST ||
    policy.excludePatterns.length > CRAWL4AI_MAX_PATTERNS_PER_LIST ||
    policy.includePatterns.some((pattern) => pattern.length > CRAWL4AI_MAX_PATTERN_LENGTH) ||
    policy.excludePatterns.some((pattern) => pattern.length > CRAWL4AI_MAX_PATTERN_LENGTH) ||
    Boolean(policy.locale && policy.locale.length > CRAWL4AI_MAX_LOCALE_LENGTH);
  if (invalidPolicy) {
    throw new CollectionAcquisitionError(
      "CRAWL4AI_POLICY_BUDGET_EXCEEDED",
      "CollectionPlan exceeds the governed Crawl4AI subprocess policy boundary",
      false,
    );
  }
  const urls = startUrls(context);
'''
if text.count(old) != 1:
    raise SystemExit(f"worker policy anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''    this.maxDepth = options.maxDepth ?? 5;
    this.maxItems = options.maxItems ?? 500;
'''
new = '''    this.maxDepth = Math.min(options.maxDepth ?? CRAWL4AI_MAX_DEPTH, CRAWL4AI_MAX_DEPTH);
    this.maxItems = Math.min(options.maxItems ?? CRAWL4AI_MAX_ITEMS, CRAWL4AI_MAX_ITEMS);
'''
if text.count(old) != 1:
    raise SystemExit(f"worker constructor anchor count={text.count(old)}")
worker_path.write_text(text.replace(old, new, 1))

python_path = Path("workers/crawl4ai/acquire.py")
py = python_path.read_text()
old = '''PROTOCOL_VERSION = "1.0"
MAX_START_URLS = 500
SUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"} | set(SUPPORTED_ATTACHMENT_KINDS)
'''
new = '''PROTOCOL_VERSION = "1.0"
MAX_START_URLS = 500
MAX_DEPTH = 5
MAX_ITEMS = 500
MAX_RATE_LIMIT_PER_MINUTE = 600
MAX_TIMEOUT_SECONDS = 300
MAX_PATTERNS_PER_LIST = 100
MAX_PATTERN_LENGTH = 500
MAX_LOCALE_LENGTH = 64
SUPPORTED_OUTPUT_KINDS = {"HTML", "MARKDOWN"} | set(SUPPORTED_ATTACHMENT_KINDS)
'''
if py.count(old) != 1:
    raise SystemExit(f"python constants anchor count={py.count(old)}")
py = py.replace(old, new, 1)
py = py.replace('if not isinstance(value, list) or len(value) > 100:', 'if not isinstance(value, list) or len(value) > MAX_PATTERNS_PER_LIST:', 1)
py = py.replace('f"{name} must be a list with at most 100 items"', 'f"{name} must be a list with at most {MAX_PATTERNS_PER_LIST} items"', 1)
py = py.replace('not isinstance(item, str) or not item or len(item) > 500', 'not isinstance(item, str) or not item or len(item) > MAX_PATTERN_LENGTH', 1)
py = py.replace('not isinstance(locale, str) or len(locale) > 64', 'not isinstance(locale, str) or len(locale) > MAX_LOCALE_LENGTH', 1)
py = py.replace('_require_int(payload.get("maxDepth"), "maxDepth", 0, 5)', '_require_int(payload.get("maxDepth"), "maxDepth", 0, MAX_DEPTH)', 1)
py = py.replace('_require_int(payload.get("maxItems"), "maxItems", 1, 500)', '_require_int(payload.get("maxItems"), "maxItems", 1, MAX_ITEMS)', 1)
py = py.replace('payload.get("rateLimitPerMinute"), "rateLimitPerMinute", 1, 600', 'payload.get("rateLimitPerMinute"), "rateLimitPerMinute", 1, MAX_RATE_LIMIT_PER_MINUTE', 1)
py = py.replace('_require_int(payload.get("timeoutSeconds"), "timeoutSeconds", 1, 300)', '_require_int(payload.get("timeoutSeconds"), "timeoutSeconds", 1, MAX_TIMEOUT_SECONDS)', 1)
python_path.write_text(py)
