from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


priority_path = "packages/persistence/src/priority-national-source-coverage.ts"
priority = read(priority_path)
if "TIPO_TW_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Taiwan coverage already present")

tw_block = r'''const TIPO_TW: Authority = {
  jurisdiction: "TW",
  authorityName: "Taiwan Intellectual Property Office (TIPO), Ministry of Economic Affairs",
  languages: ["zh", "en"],
  verificationEvidenceUri: "https://www.tipo.gov.tw/en/tipo2/392.html",
};

export const TIPO_TW_SOURCE_COVERAGE_TARGETS = [
  target(TIPO_TW, {
    id: "tw-tipo-trademark-portal",
    family: "PORTAL",
    displayName: "Taiwan TIPO Trademarks Portal",
    canonicalUri: "https://www.tipo.gov.tw/en/tipo2/392.html",
    verificationEvidenceUri: "https://www.tipo.gov.tw/en/tipo2/392.html",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-filing",
    family: "FILING",
    displayName: "Taiwan TIPO New Trademark Online Application",
    canonicalUri: "https://tiponet.tipo.gov.tw/S040WV1/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://tiponet.tipo.gov.tw/100_OUT_V1/onlineTeaching/electronicApplication.do",
    notes:
      "TIPO's current e-service provides the new trademark online application workflow, including application data, designated goods/services, signing and electronic submission.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-search",
    family: "SEARCH",
    displayName: "Taiwan TIPO New Trademark Search System",
    canonicalUri: "https://cloud.tipo.gov.tw/S282/S282WV1/?lang=en",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/en/tipo2/358.html",
    notes: "Current cloud-based trademark search system; the legacy search system was retired in 2025.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-fees",
    family: "FEES",
    displayName: "Taiwan TIPO Trademark Fee Schedule",
    canonicalUri: "https://www.tipo.gov.tw/tw/trademarks/589.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/tw/trademarks/589.html",
    notes:
      "Current published trademark fee list. TIPO published a draft amendment to Article 2 in June 2026, but the official regulatory index still identifies it as a proposed amendment rather than a replacement fee schedule.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Taiwan TIPO Nice Classification 13-2026",
    canonicalUri: "https://www.tipo.gov.tw/tw/trademarks/591-8491.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/tw/trademarks/591-8491.html",
    notes: "Official TIPO Nice Classification page listing the 13th Edition, Version 2026 and its bilingual goods/services materials.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Taiwan TIPO Trademark Act and Regulations",
    canonicalUri: "https://www.tipo.gov.tw/en/tipo2/376.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/en/tipo2/376.html",
    notes: "Official TIPO trademark laws and regulations index, including the Trademark Act and Enforcement Rules.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-examination-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Taiwan TIPO Trademark Procedural Examination Guidelines",
    canonicalUri: "https://www.tipo.gov.tw/tw/trademarks/576-66027.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/tw/trademarks/576-66027.html",
    notes: "Current procedural examination guidelines, revised in November 2025 and effective from 1 December 2025.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Taiwan TIPO Trademark Dispute Procedural Examination Guidelines",
    canonicalUri: "https://www.tipo.gov.tw/tw/trademarks/576-17748.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/tw/trademarks/576-17748.html",
    notes: "Official procedural examination guidelines for trademark dispute matters, including opposition and invalidation-related procedure.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Taiwan TIPO Trademark Renewal",
    canonicalUri: "https://www.tipo.gov.tw/en/tipo2/392-2406.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://www.tipo.gov.tw/en/tipo2/392-2406.html",
    notes: "Official renewal procedure and current per-class renewal fee guidance.",
  }),
  target(TIPO_TW, {
    id: "tw-tipo-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Taiwan TIPO Trademark Online Gazette",
    canonicalUri: "https://tiponet.tipo.gov.tw/",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://tiponet.tipo.gov.tw/",
    notes:
      "TIPO's current e-service portal exposes the Trademark Online Gazette under public information; retain the gazette as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", tw_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "TIPO_TW_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Taiwan catalog export already present")
catalog = replace_once(
    catalog,
    "  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n",
        "  ...UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  ...TIPO_TW_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  UANIPIO_UA_SOURCE_COVERAGE_TARGETS,\n  TIPO_TW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["UA", UANIPIO_UA_SOURCE_COVERAGE_TARGETS, ["nipo.gov.ua"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["UA", UANIPIO_UA_SOURCE_COVERAGE_TARGETS, ["nipo.gov.ua"]],\n  ["TW", TIPO_TW_SOURCE_COVERAGE_TARGETS, ["tipo.gov.tw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-five priority national offices", "sixty-six priority national offices")
priority_test = priority_test.replace("toHaveLength(523)", "toHaveLength(533)", 1)
priority_test = priority_test.replace("    523,\n", "    533,\n", 1)
priority_test = priority_test.replace(").toBe(523);", ").toBe(533);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "tw-tipo-trademark-portal-name" in retrieval:
    raise SystemExit("Taiwan retrieval probes already present")
probes = r'''  {
    id: "tw-tipo-trademark-portal-name",
    targetId: "tw-tipo-trademark-portal",
    query: "TIPO trademarks Taiwan",
  },
  {
    id: "tw-tipo-trademark-filing-name",
    targetId: "tw-tipo-trademark-filing",
    query: "新版商標線上申請 電子送件",
  },
  {
    id: "tw-tipo-trademark-search-name",
    targetId: "tw-tipo-trademark-search",
    query: "new trademark search system",
  },
  {
    id: "tw-tipo-trademark-fees-name",
    targetId: "tw-tipo-trademark-fees",
    query: "商標規費 註冊申請費 延展",
  },
  {
    id: "tw-tipo-trademark-classification-name",
    targetId: "tw-tipo-trademark-classification",
    query: "尼斯第13-2026版 商品 服務",
  },
  {
    id: "tw-tipo-trademark-legal-texts-name",
    targetId: "tw-tipo-trademark-legal-texts",
    query: "Trademark Act Enforcement Rules",
  },
  {
    id: "tw-tipo-trademark-examination-guidelines-name",
    targetId: "tw-tipo-trademark-examination-guidelines",
    query: "商標註冊申請案件程序審查基準",
  },
  {
    id: "tw-tipo-trademark-proceedings-name",
    targetId: "tw-tipo-trademark-proceedings",
    query: "商標爭議案件程序審查基準 異議 評定",
  },
  {
    id: "tw-tipo-trademark-renewal-name",
    targetId: "tw-tipo-trademark-renewal",
    query: "trademark renewal term rights fee",
  },
'''
closing = "] satisfies readonly RetrievalRelevanceProbe[];"
pos = retrieval.find(closing)
if pos < 0:
    raise SystemExit("missing retrieval probe array closing")
retrieval = retrieval[:pos] + probes + retrieval[pos:]
write(retrieval_path, retrieval)

retrieval_test_path = "packages/persistence/tests/retrieval-relevance-audit.test.ts"
retrieval_test = read(retrieval_test_path)
retrieval_test = retrieval_test.replace("toHaveLength(490)", "toHaveLength(499)", 2)
retrieval_test = retrieval_test.replace("      490,\n", "      499,\n", 1)
tw_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "TW", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "UA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + tw_assertion, "retrieval Taiwan jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Taiwan TIPO source coverage patch applied")
