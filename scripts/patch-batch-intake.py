from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


service = "apps/admin/src/server/discovery-service.ts"
replace_once(
    service,
    '''import type {\n  CollectionPlan,\n  SourceDefinition,\n  SourceDiscoveryConstraints,\n  SourceDiscoveryLineage,\n} from "@markorbit/contracts";''',
    '''import type {\n  AuthorityLevel,\n  CollectionPlan,\n  SourceCategory,\n  SourceDefinition,\n  SourceDiscoveryConstraints,\n  SourceDiscoveryLineage,\n} from "@markorbit/contracts";''',
)
replace_once(
    service,
    '''export type StartDiscoveryInput = {\n  locator: string;\n  maxDepth?: number;\n  maxCandidates?: number;\n  maxFetches?: number;\n  discoverExternalLinks?: boolean;\n  maxExternalCandidates?: number;\n  maxExpansionGeneration?: number;\n  deniedUrlPatterns?: string[];\n  lineage?: SourceDiscoveryLineage;\n};\n\nexport type ExpandSourceDiscoveryInput = Omit<StartDiscoveryInput, "locator" | "lineage">;''',
    '''export type DiscoveryIntakeDefaults = {\n  category?: SourceCategory;\n  authorityLevel?: AuthorityLevel;\n  jurisdictions?: string[];\n  languages?: string[];\n  note?: string;\n  tags?: string[];\n};\n\nexport type StartDiscoveryInput = {\n  locator: string;\n  maxDepth?: number;\n  maxCandidates?: number;\n  maxFetches?: number;\n  discoverExternalLinks?: boolean;\n  maxExternalCandidates?: number;\n  maxExpansionGeneration?: number;\n  deniedUrlPatterns?: string[];\n  lineage?: SourceDiscoveryLineage;\n  intake?: DiscoveryIntakeDefaults;\n};\n\nexport type StartBatchDiscoveryInput = Omit<StartDiscoveryInput, "locator" | "lineage"> & {\n  locators: string[];\n};\n\nexport type ExpandSourceDiscoveryInput = Omit<\n  StartDiscoveryInput,\n  "locator" | "lineage" | "intake"\n>;''',
)
replace_once(
    service,
    '''function normalizedDeniedPatterns(values: string[] | undefined): string[] {\n  return (values ?? [])\n    .map((value) => value.trim())\n    .filter(Boolean)\n    .slice(0, 50);\n}\n\nfunction websiteSourceSlug''',
    '''function normalizedDeniedPatterns(values: string[] | undefined): string[] {\n  return (values ?? [])\n    .map((value) => value.trim())\n    .filter(Boolean)\n    .slice(0, 50);\n}\n\nfunction normalizedStringList(\n  values: string[] | undefined,\n  options: { uppercase?: boolean; limit: number },\n): string[] {\n  const normalized = (values ?? [])\n    .map((value) => value.trim())\n    .filter(Boolean)\n    .map((value) => (options.uppercase ? value.toUpperCase() : value));\n  return [...new Set(normalized)].slice(0, options.limit);\n}\n\nfunction normalizedIntakeDefaults(\n  input: DiscoveryIntakeDefaults | undefined,\n): DiscoveryIntakeDefaults | undefined {\n  if (!input) return undefined;\n  const jurisdictions = normalizedStringList(input.jurisdictions, { uppercase: true, limit: 20 });\n  const languages = normalizedStringList(input.languages, { limit: 20 });\n  const tags = normalizedStringList(input.tags, { limit: 30 });\n  const note = input.note?.trim().slice(0, 1_000);\n  const normalized: DiscoveryIntakeDefaults = {\n    ...(input.category ? { category: input.category } : {}),\n    ...(input.authorityLevel ? { authorityLevel: input.authorityLevel } : {}),\n    ...(jurisdictions.length > 0 ? { jurisdictions } : {}),\n    ...(languages.length > 0 ? { languages } : {}),\n    ...(note ? { note } : {}),\n    ...(tags.length > 0 ? { tags } : {}),\n  };\n  return Object.keys(normalized).length > 0 ? normalized : undefined;\n}\n\nfunction candidateIntakeDefaults(\n  candidate: SourceCandidateRecord["candidate"],\n): DiscoveryIntakeDefaults | undefined {\n  const value = candidate.metadata?.operatorIntakeDefaults;\n  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;\n  const record = value as Record<string, unknown>;\n  return normalizedIntakeDefaults({\n    ...(typeof record.category === "string" ? { category: record.category as SourceCategory } : {}),\n    ...(typeof record.authorityLevel === "string"\n      ? { authorityLevel: record.authorityLevel as AuthorityLevel }\n      : {}),\n    ...(Array.isArray(record.jurisdictions) &&\n    record.jurisdictions.every((item) => typeof item === "string")\n      ? { jurisdictions: record.jurisdictions as string[] }\n      : {}),\n    ...(Array.isArray(record.languages) &&\n    record.languages.every((item) => typeof item === "string")\n      ? { languages: record.languages as string[] }\n      : {}),\n    ...(typeof record.note === "string" ? { note: record.note } : {}),\n    ...(Array.isArray(record.tags) && record.tags.every((item) => typeof item === "string")\n      ? { tags: record.tags as string[] }\n      : {}),\n  });\n}\n\nfunction sourceWebsiteOrigins(source: SourceDefinition): string[] {\n  const values = [source.canonicalUri, ...source.entrypoints.map((entrypoint) => entrypoint.uri)].filter(\n    (value): value is string => Boolean(value),\n  );\n  const origins: string[] = [];\n  for (const value of values) {\n    try {\n      origins.push(websiteOrigin(value));\n    } catch {\n      // Non-HTTP entrypoints cannot represent a website origin.\n    }\n  }\n  return [...new Set(origins)];\n}\n\nfunction websiteSourceSlug''',
)
replace_once(
    service,
    '''  async start(input: StartDiscoveryInput) {\n    const locator = normalizeSeedLocator(input.locator);\n    const maxExpansionGeneration = boundedInteger(''',
    '''  async start(input: StartDiscoveryInput) {\n    const locator = normalizeSeedLocator(input.locator);\n    const intake = normalizedIntakeDefaults(input.intake);\n    const maxExpansionGeneration = boundedInteger(''',
)
replace_once(
    service,
    '''        ...(lineage.rootSourceId ? { rootSourceId: lineage.rootSourceId } : {}),\n      },\n    });''',
    '''        ...(lineage.rootSourceId ? { rootSourceId: lineage.rootSourceId } : {}),\n        ...(intake ? { operatorIntakeDefaults: intake } : {}),\n      },\n    });''',
)
replace_once(
    service,
    '''      const discovered = await this.dependencies.provider.discover(batch);\n      const candidates = discovered.map(enrichDiscoveryCandidate);\n      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);\n      const seedOrigin = websiteOrigin(seed.locator);''',
    '''      const discovered = await this.dependencies.provider.discover(batch);\n      const seedOrigin = websiteOrigin(seed.locator);\n      const candidates = discovered.map(enrichDiscoveryCandidate).map((candidate) =>\n        intake && belongsToOrigin(candidate.locator, seedOrigin)\n          ? {\n              ...candidate,\n              metadata: {\n                ...candidate.metadata,\n                operatorIntakeDefaults: intake,\n              },\n            }\n          : candidate,\n      );\n      const completed = this.dependencies.discovery.completeBatch(batch.batchId, candidates);''',
)

batch_method = '''  async startBatch(input: StartBatchDiscoveryInput) {\n    if (!Array.isArray(input.locators) || input.locators.length === 0 || input.locators.length > 100) {\n      throw new RegistryValidationError("Batch discovery requires 1 to 100 locators");\n    }\n\n    const existingOrigins = new Map<string, string>();\n    let sourceOffset = 0;\n    while (true) {\n      const page = this.dependencies.sources.list({\n        sourceType: "WEB",\n        limit: 100,\n        offset: sourceOffset,\n      });\n      for (const source of page.items) {\n        if (source.status === "ARCHIVED") continue;\n        for (const origin of sourceWebsiteOrigins(source)) existingOrigins.set(origin, source.id);\n      }\n      sourceOffset += page.items.length;\n      if (page.items.length === 0 || sourceOffset >= page.total) break;\n    }\n\n    const seenOrigins = new Set<string>();\n    const items: Array<{\n      input: string;\n      locator?: string;\n      origin?: string;\n      status: "STARTED" | "SKIPPED_DUPLICATE_INPUT" | "SKIPPED_EXISTING_SOURCE" | "FAILED";\n      sourceId?: string;\n      batchId?: string;\n      candidateCount?: number;\n      message?: string;\n    }> = [];\n    let started = 0;\n    let skippedDuplicateInput = 0;\n    let skippedExistingSource = 0;\n    let failed = 0;\n    let candidateCount = 0;\n    const { locators, ...defaults } = input;\n\n    for (const rawLocator of locators) {\n      let locator: string;\n      let origin: string;\n      try {\n        locator = normalizeSeedLocator(rawLocator);\n        origin = websiteOrigin(locator);\n      } catch (error) {\n        failed += 1;\n        items.push({\n          input: rawLocator,\n          status: "FAILED",\n          message: error instanceof Error ? error.message : "Invalid discovery seed",\n        });\n        continue;\n      }\n\n      if (seenOrigins.has(origin)) {\n        skippedDuplicateInput += 1;\n        items.push({ input: rawLocator, locator, origin, status: "SKIPPED_DUPLICATE_INPUT" });\n        continue;\n      }\n      seenOrigins.add(origin);\n\n      const profile = this.dependencies.graph.getProfileByCanonicalOrigin(DEFAULT_WORKSPACE.id, origin);\n      const existingSourceId = profile?.sourceId ?? existingOrigins.get(origin);\n      if (existingSourceId) {\n        skippedExistingSource += 1;\n        items.push({\n          input: rawLocator,\n          locator,\n          origin,\n          status: "SKIPPED_EXISTING_SOURCE",\n          sourceId: existingSourceId,\n        });\n        continue;\n      }\n\n      try {\n        const result = await this.start({ ...defaults, locator });\n        started += 1;\n        candidateCount += result.candidates.length;\n        items.push({\n          input: rawLocator,\n          locator,\n          origin,\n          status: "STARTED",\n          batchId: result.batch.batch.batchId,\n          candidateCount: result.candidates.length,\n        });\n      } catch (error) {\n        failed += 1;\n        items.push({\n          input: rawLocator,\n          locator,\n          origin,\n          status: "FAILED",\n          message: error instanceof Error ? error.message : "Discovery failed",\n        });\n      }\n    }\n\n    return {\n      summary: {\n        submitted: locators.length,\n        uniqueOrigins: seenOrigins.size,\n        started,\n        skippedDuplicateInput,\n        skippedExistingSource,\n        failed,\n        candidateCount,\n      },\n      items,\n    };\n  }\n\n'''
file = Path(service)
text = file.read_text()
marker = '''  async expandSource(sourceId: string, input: ExpandSourceDiscoveryInput = {}) {'''
if batch_method not in text:
    if marker not in text:
        raise SystemExit("expandSource marker not found")
    file.write_text(text.replace(marker, batch_method + marker, 1))

replace_once(
    service,
    '''      let source: SourceDefinition;\n      let plan: CollectionPlan;\n      let profile = targetProfile;''',
    '''      const intake = isExternalCandidate ? undefined : candidateIntakeDefaults(current.candidate);\n      let source: SourceDefinition;\n      let plan: CollectionPlan;\n      let profile = targetProfile;''',
)
replace_once(
    service,
    '''          sourceType: "WEB",\n          category: "OTHER",\n          authorityLevel: "UNKNOWN",\n          status: "ACTIVE",\n          jurisdictions: ["GLOBAL"],\n          languages: ["und"],''',
    '''          sourceType: "WEB",\n          category: intake?.category ?? "OTHER",\n          authorityLevel: intake?.authorityLevel ?? "UNKNOWN",\n          status: "ACTIVE",\n          jurisdictions: intake?.jurisdictions?.length ? intake.jurisdictions : ["GLOBAL"],\n          languages: intake?.languages?.length ? intake.languages : ["und"],''',
)
replace_once(
    service,
    '''          tags: [\n            "discovery-accepted",\n            "website-source",\n            ...(isExternalCandidate ? ["external-source"] : []),\n          ],\n          extensions: {''',
    '''          tags: [\n            "discovery-accepted",\n            "website-source",\n            ...(isExternalCandidate ? ["external-source"] : []),\n            ...(intake?.tags ?? []),\n          ],\n          extensions: {''',
)
replace_once(
    service,
    '''            ...(isExternalCandidate\n              ? {\n                  "x-markorbit-discovery-origin": "EXTERNAL_LINK",\n                  "x-markorbit-discovered-from-url":\n                    current.candidate.discoveredFrom ?? seed.locator,\n                }\n              : {}),\n          },''',
    '''            ...(isExternalCandidate\n              ? {\n                  "x-markorbit-discovery-origin": "EXTERNAL_LINK",\n                  "x-markorbit-discovered-from-url":\n                    current.candidate.discoveredFrom ?? seed.locator,\n                }\n              : {}),\n            ...(intake?.note ? { "x-markorbit-intake-note": intake.note } : {}),\n          },''',
)

ui = "apps/admin/src/lib/admin-v2/discovery-intake-workbench.tsx"
replace_once(
    ui,
    '''import { PageHeading } from "@/components/page-heading";''',
    '''import { SOURCE_CATEGORIES, type SourceCategory } from "@markorbit/contracts";\nimport { PageHeading } from "@/components/page-heading";''',
)
replace_once(
    ui,
    '''function normalizedLocators(value: string): string[] {\n  const values = value\n    .split(/[\\n,]/)\n    .map((item) => item.trim())\n    .filter(Boolean);\n  return [...new Set(values)].slice(0, 100);\n}\n\nexport function DiscoveryIntakeUi() {''',
    '''function normalizedLocators(value: string): string[] {\n  const values = value\n    .split(/[\\n,]/)\n    .map((item) => item.trim())\n    .filter(Boolean);\n  return [...new Set(values)].slice(0, 100);\n}\n\nfunction categoryLabel(value: SourceCategory, zh: boolean): string {\n  if (!zh) {\n    return value\n      .toLowerCase()\n      .split("_")\n      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))\n      .join(" ");\n  }\n  const labels: Partial<Record<SourceCategory, string>> = {\n    OFFICIAL_AUTHORITY: "官方机构",\n    GOVERNMENT_PUBLICATION: "政府出版物",\n    INTERGOVERNMENTAL: "国际组织",\n    PUBLIC_REFERENCE: "公共参考资料",\n    PROFESSIONAL_ASSOCIATION: "专业协会",\n    LAW_FIRM: "律所 / 代理机构",\n    PROFESSIONAL: "专业人士",\n    MEDIA: "媒体",\n    USER_PROVIDED: "用户提供",\n    OTHER: "其他",\n  };\n  return labels[value] ?? value;\n}\n\nexport function DiscoveryIntakeUi() {''',
)
replace_once(
    ui,
    '''  const { locale } = useAdminI18n();\n  const t = useCallback(''',
    '''  const { locale } = useAdminI18n();\n  const zh = locale === "zh-CN";\n  const t = useCallback(''',
)
replace_once(
    ui,
    '''  const [maxDepth, setMaxDepth] = useState(1);\n  const [maxCandidates, setMaxCandidates] = useState(100);''',
    '''  const [maxDepth, setMaxDepth] = useState(1);\n  const [maxCandidates, setMaxCandidates] = useState(100);\n  const [category, setCategory] = useState<SourceCategory>("OTHER");\n  const [jurisdictions, setJurisdictions] = useState("GLOBAL");\n  const [language, setLanguage] = useState("und");\n  const [note, setNote] = useState("");''',
)

file = Path(ui)
text = file.read_text()
start_marker = '''  async function start() {'''
end_marker = '''\n  function statusLabel(status: DiscoveryStatus): string {'''
start_index = text.find(start_marker)
end_index = text.find(end_marker, start_index)
if start_index < 0 or end_index < 0:
    raise SystemExit("Discovery start function markers not found")
new_start = '''  async function start() {\n    if (inputs.length === 0) return;\n    setRunning(true);\n    setError(null);\n    setMessage(null);\n    setProgress({ completed: 0, total: inputs.length });\n    try {\n      const response = await fetch("/api/discovery/batch", {\n        method: "POST",\n        headers: { "content-type": "application/json" },\n        body: JSON.stringify({\n          locators: inputs,\n          maxDepth,\n          maxCandidates,\n          deniedUrlPatterns: ["/login", "/signin", "/logout"],\n          intake: {\n            category,\n            jurisdictions: jurisdictions\n              .split(",")\n              .map((item) => item.trim())\n              .filter(Boolean),\n            languages: language\n              .split(",")\n              .map((item) => item.trim())\n              .filter(Boolean),\n            note,\n          },\n        }),\n      });\n      if (!response.ok) throw new Error(await readError(response));\n      const result = (await response.json()) as {\n        summary: {\n          submitted: number;\n          uniqueOrigins: number;\n          started: number;\n          skippedDuplicateInput: number;\n          skippedExistingSource: number;\n          failed: number;\n          candidateCount: number;\n        };\n      };\n      setProgress({ completed: inputs.length, total: inputs.length });\n      setMessage(\n        t("discoveryBatchSuccessSummary", {\n          submitted: result.summary.submitted,\n          started: result.summary.started,\n          duplicates: result.summary.skippedDuplicateInput,\n          existing: result.summary.skippedExistingSource,\n          failed: result.summary.failed,\n          candidates: result.summary.candidateCount,\n        }),\n      );\n      await refresh();\n    } catch (runError) {\n      setError(runError instanceof Error ? runError.message : t("discoveryRunError"));\n    } finally {\n      setRunning(false);\n    }\n  }\n'''
file.write_text(text[:start_index] + new_start + text[end_index:])

form_marker = '''          <div className="mt-4 grid gap-3 sm:grid-cols-2">\n            <label className="text-xs font-medium text-slate-600">\n              {t("discoveryDepth")}'''
form = '''          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">\n            <div>\n              <p className="text-xs font-semibold text-slate-700">{t("intakeDefaultsTitle")}</p>\n              <p className="mt-1 text-xs leading-5 text-slate-500">\n                {t("intakeDefaultsDescription")}\n              </p>\n            </div>\n            <div className="mt-3 grid gap-3 md:grid-cols-3">\n              <label className="text-xs font-medium text-slate-600">\n                {t("intakeCategory")}\n                <select\n                  value={category}\n                  onChange={(event) => setCategory(event.target.value as SourceCategory)}\n                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"\n                >\n                  {SOURCE_CATEGORIES.map((value) => (\n                    <option key={value} value={value}>\n                      {categoryLabel(value, zh)}\n                    </option>\n                  ))}\n                </select>\n              </label>\n              <label className="text-xs font-medium text-slate-600">\n                {t("jurisdictions")}\n                <input\n                  value={jurisdictions}\n                  onChange={(event) => setJurisdictions(event.target.value.toUpperCase())}\n                  placeholder={t("intakeJurisdictionPlaceholder")}\n                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"\n                />\n              </label>\n              <label className="text-xs font-medium text-slate-600">\n                {t("language")}\n                <input\n                  value={language}\n                  onChange={(event) => setLanguage(event.target.value)}\n                  placeholder={t("intakeLanguagePlaceholder")}\n                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"\n                />\n              </label>\n            </div>\n            <label className="mt-3 block text-xs font-medium text-slate-600">\n              {t("intakeNote")}\n              <input\n                value={note}\n                onChange={(event) => setNote(event.target.value)}\n                maxLength={1000}\n                placeholder={t("intakeNotePlaceholder")}\n                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"\n              />\n            </label>\n            <p className="mt-3 text-[11px] leading-5 text-slate-500">{t("originDedupHint")}</p>\n          </div>\n\n'''
file = Path(ui)
text = file.read_text()
if form not in text:
    if form_marker not in text:
        raise SystemExit("Discovery intake form marker not found")
    file.write_text(text.replace(form_marker, form + form_marker, 1))


i18n = "apps/admin/src/lib/intake-i18n.ts"
replace_once(
    i18n,
    '''  websiteAddresses: "网站地址",\n  discoveryDepth: "发现深度",''',
    '''  websiteAddresses: "网站地址",\n  intakeDefaultsTitle: "批量来源默认信息",\n  intakeDefaultsDescription:\n    "这些信息会随候选进入来源审核；只有批准原始网站来源时才会写入 Source，外链发现的其他网站不会继承。",\n  intakeCategory: "来源分类",\n  intakeJurisdictionPlaceholder: "例如 US，多个用逗号分隔",\n  intakeLanguagePlaceholder: "例如 en，多个用逗号分隔",\n  intakeNote: "备注（可选）",\n  intakeNotePlaceholder: "例如：美国商标局官方资料入口",\n  originDedupHint:\n    "批量提交按网站 Origin 去重；已在 Sources 中存在的网站会自动跳过，不会重复创建来源。",\n  discoveryBatchSuccessSummary:\n    "已提交 {submitted} 个网址：启动 {started} 个网站，跳过 {duplicates} 个重复输入、{existing} 个已有来源，失败 {failed} 个，共发现 {candidates} 个候选。",\n  discoveryDepth: "发现深度",''',
)
replace_once(
    i18n,
    '''  websiteAddresses: "Website URLs",\n  discoveryDepth: "Discovery depth",''',
    '''  websiteAddresses: "Website URLs",\n  intakeDefaultsTitle: "Batch source defaults",\n  intakeDefaultsDescription:\n    "These defaults travel with the review candidate and are written only when the original seeded website is approved. Externally discovered sites do not inherit them.",\n  intakeCategory: "Source category",\n  intakeJurisdictionPlaceholder: "Example: US; separate multiple values with commas",\n  intakeLanguagePlaceholder: "Example: en; separate multiple values with commas",\n  intakeNote: "Note (optional)",\n  intakeNotePlaceholder: "Example: official trademark office material entry point",\n  originDedupHint:\n    "Batch submission deduplicates by website origin. Websites already represented in Sources are skipped instead of creating duplicate sources.",\n  discoveryBatchSuccessSummary:\n    "Submitted {submitted} URLs: started {started} websites, skipped {duplicates} duplicate inputs and {existing} existing sources, {failed} failed, and found {candidates} candidates.",\n  discoveryDepth: "Discovery depth",''',
)
