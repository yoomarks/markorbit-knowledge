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
if "ILPO_IL_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Israel coverage already present")

il_block = r'''const ILPO_IL: Authority = {
  jurisdiction: "IL",
  authorityName: "Israel Patent Office (ILPO) – Trademarks Department",
  languages: ["he", "en", "ar"],
  verificationEvidenceUri: "https://www.gov.il/en/Departments/ilpo",
};

export const ILPO_IL_SOURCE_COVERAGE_TARGETS = [
  target(ILPO_IL, {
    id: "il-ilpo-trademark-portal",
    family: "PORTAL",
    displayName: "Israel Patent Office Portal – Trademarks",
    canonicalUri: "https://www.gov.il/en/Departments/ilpo",
    verificationEvidenceUri: "https://www.gov.il/en/Departments/ilpo",
    notes:
      "The Ministry of Justice ILPO landing page identifies the Trademarks Department and links current trademark online services and databases.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-filing",
    family: "FILING",
    displayName: "Israel Trademark Registration Service",
    canonicalUri: "https://www.gov.il/he/service/trademark_registration",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.il/he/service/trademark_registration",
    notes:
      "Official Ministry of Justice service for filing a national trademark application online, including application requirements and payment workflow.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-search",
    family: "SEARCH",
    displayName: "Israel Trademarks Search Database",
    canonicalUri: "https://trademarks.justice.gov.il/TradeMarkSearch/TradeMarkSearch?lang=en",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.gov.il/en/Departments/ilpo",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-search-fees",
    family: "FEES",
    displayName: "Israel Trademark Examiner Search Fee and Payment Guidance",
    canonicalUri: "https://www.gov.il/he/service/search_israeli_trademarks_database",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.il/he/service/search_israeli_trademarks_database",
    notes:
      "Official paid examiner-search service under Rule 78A with current payment instructions; the separate public trademark database remains free for self-search.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Israel Trademark Goods and Services Classification Guidance",
    canonicalUri: "https://www.gov.il/he/pages/trademark-protection?chapterIndex=2",
    verificationEvidenceUri: "https://www.gov.il/he/pages/trademark-protection?chapterIndex=2",
    notes:
      "Official ILPO guidance on classifying goods and services under the Nice Classification, including the 45-class structure and filing guidance.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Israel Trade Marks Ordinance 1972",
    canonicalUri:
      "https://main.knesset.gov.il/activity/legislation/laws/pages/LawPrimary.aspx?lawitemid=2000955&st=lawlaws",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://main.knesset.gov.il/activity/legislation/laws/pages/LawPrimary.aspx?lawitemid=2000955&st=lawlaws",
    notes:
      "Official Knesset National Legislation Database record for the Trade Marks Ordinance [New Version], 1972, including amendment history and current validity.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-registrar-circulars",
    family: "POLICY_NOTICES",
    displayName: "Israel Patent Office Registrar Circulars",
    canonicalUri: "https://www.gov.il/he/departments/dynamiccollectors/registrar-publications",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.il/he/departments/dynamiccollectors/registrar-publications",
    notes:
      "Living official collection of Registrar circulars, updated when circulars are issued, amended or cancelled; includes trademark practice instructions.",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "Israel Trademark Opposition Procedure",
    canonicalUri: "https://www.gov.il/he/service/objection_to_obtained_trademark",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.il/he/service/objection_to_obtained_trademark",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Israel Trademark Renewal",
    canonicalUri: "https://www.gov.il/he/service/trademark_renewal",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.gov.il/he/service/trademark_renewal",
  }),
  target(ILPO_IL, {
    id: "il-ilpo-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Israel Trade Marks Journal",
    canonicalUri: "https://trademarks.justice.gov.il/TradeMarkSearch/TradeMarksJournal?lang=en",
    coverageTier: "CHANGE_SIGNAL",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON", "PDF"],
    verificationEvidenceUri: "https://trademarks.justice.gov.il/TradeMarkSearch/TradeMarksJournal?lang=en",
    notes:
      "Official online Trade Marks Journal covering marks published for opposition, registrations, renewals, cancellations, register changes and proceedings; retained as a publication change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", il_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "ILPO_IL_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Israel catalog export already present")
catalog = replace_once(
    catalog,
    "  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...IPD_HK_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n",
        "  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ...ILPO_IL_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  IPD_HK_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  IPD_HK_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  IPD_HK_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  IPD_HK_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ILPO_IL_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["HK", IPD_HK_SOURCE_COVERAGE_TARGETS, ["ipd.gov.hk"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["HK", IPD_HK_SOURCE_COVERAGE_TARGETS, ["ipd.gov.hk"]],\n  ["IL", ILPO_IL_SOURCE_COVERAGE_TARGETS, ["gov.il", "justice.gov.il", "knesset.gov.il"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-three priority national offices", "sixty-four priority national offices")
priority_test = priority_test.replace("toHaveLength(504)", "toHaveLength(514)", 1)
priority_test = priority_test.replace("    504,\n", "    514,\n", 1)
priority_test = priority_test.replace(").toBe(504);", ").toBe(514);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "il-ilpo-trademark-portal-name" in retrieval:
    raise SystemExit("Israel retrieval probes already present")
probes = r'''  {
    id: "il-ilpo-trademark-portal-name",
    targetId: "il-ilpo-trademark-portal",
    query: "Israel Patent Office trademarks",
  },
  {
    id: "il-ilpo-trademark-filing-name",
    targetId: "il-ilpo-trademark-filing",
    query: "trademark registration online application",
  },
  {
    id: "il-ilpo-trademark-search-name",
    targetId: "il-ilpo-trademark-search",
    query: "trademarks search Israel",
  },
  {
    id: "il-ilpo-trademark-search-fees-name",
    targetId: "il-ilpo-trademark-search-fees",
    query: "trademark search fee Rule 78A",
  },
  {
    id: "il-ilpo-trademark-classification-name",
    targetId: "il-ilpo-trademark-classification",
    query: "Nice classification goods services 45 classes",
  },
  {
    id: "il-ilpo-trademark-legal-texts-name",
    targetId: "il-ilpo-trademark-legal-texts",
    query: "Trade Marks Ordinance 1972",
  },
  {
    id: "il-ilpo-registrar-circulars-name",
    targetId: "il-ilpo-registrar-circulars",
    query: "Registrar circulars trademarks",
  },
  {
    id: "il-ilpo-trademark-opposition-name",
    targetId: "il-ilpo-trademark-opposition",
    query: "trademark opposition three months",
  },
  {
    id: "il-ilpo-trademark-renewal-name",
    targetId: "il-ilpo-trademark-renewal",
    query: "trademark renewal",
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
retrieval_test = retrieval_test.replace("toHaveLength(473)", "toHaveLength(482)", 2)
retrieval_test = retrieval_test.replace("      473,\n", "      482,\n", 1)
il_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "IL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "HK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + il_assertion, "retrieval Israel jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Israel ILPO trademark source coverage patch applied")
