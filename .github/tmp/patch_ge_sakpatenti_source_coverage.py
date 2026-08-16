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
if "SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Georgia coverage already present")

ge_block = r'''const SAKPATENTI_GE: Authority = {
  jurisdiction: "GE",
  authorityName: "National Intellectual Property Center of Georgia (Sakpatenti)",
  languages: ["ka", "en"],
  verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/120/",
};

export const SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS = [
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-portal",
    family: "PORTAL",
    displayName: "Georgia Sakpatenti Trademarks Portal",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/120/",
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/120/",
    notes:
      "Current Sakpatenti trademark hub linking national legislation, classifications, electronic application, fees, practice documents and search.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-filing",
    family: "FILING",
    displayName: "Georgia Sakpatenti Online Filing",
    canonicalUri: "https://online.sakpatenti.gov.ge/ka/app/login/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/111/",
    notes:
      "Sakpatenti's official online-filing page links directly to the authenticated national electronic application system.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-search",
    family: "SEARCH",
    displayName: "Georgia Sakpatenti Trademark Search",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/search_engine/search/3/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/185/",
    notes:
      "Official Trademarks Protected in Georgia search with field, image and Nice-class search capabilities.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-fees",
    family: "FEES",
    displayName: "Georgia Sakpatenti Trademark Fees",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/14/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/14/",
    notes:
      "Current trademark fee schedule covering examination, publication, registration, renewal and other national and Madrid-related actions; electronic filing receives the published discount.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Georgia Sakpatenti Trademark Classifications",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/33/",
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/33/",
    notes:
      "Official Sakpatenti classification page for the International (Nice) Classification of Goods and Services and Vienna Classification.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Georgia Trademark Law",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/12/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/120/",
    notes:
      "Official Sakpatenti publication of the Trademark Law of Georgia governing registration, examination, publication, appeal, renewal and enforcement.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-practice",
    family: "EXAMINATION_MANUAL",
    displayName: "Georgia Sakpatenti Trademark Practice Documents",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/193/",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/193/",
    notes:
      "Official trademark practice papers covering distinctiveness, black-and-white marks and likelihood of confusion/relative grounds.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Georgia Sakpatenti Trademark Registration and Appeal Procedure",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/page/168/",
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/page/168/",
    notes:
      "Official registration procedure describing formal and substantive examination, publication and the three-month appeal window before the Sakpatenti Chamber of Appeals.",
  }),
  target(SAKPATENTI_GE, {
    id: "ge-sakpatenti-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Georgia Sakpatenti Official Bulletin of Industrial Property",
    canonicalUri: "https://www.sakpatenti.gov.ge/en/publications/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.sakpatenti.gov.ge/en/publications/",
    notes:
      "Sakpatenti's official publications page lists the 2026 Industrial Property bulletins; retain the bulletin collection as a publication change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ge_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Georgia catalog export already present")
catalog = replace_once(
    catalog,
    "  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n",
        "  ...QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS,\n  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["KZ", QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS, ["kazpatent.kz"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["KZ", QAZPATENT_KZ_SOURCE_COVERAGE_TARGETS, ["kazpatent.kz"]],\n  ["GE", SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS, ["sakpatenti.gov.ge"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-seven priority national offices", "sixty-eight priority national offices")
priority_test = priority_test.replace("toHaveLength(542)", "toHaveLength(551)", 1)
priority_test = priority_test.replace("    542,\n", "    551,\n", 1)
priority_test = priority_test.replace(").toBe(542);", ").toBe(551);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ge-sakpatenti-trademark-portal-name" in retrieval:
    raise SystemExit("Georgia retrieval probes already present")
probes = r'''  {
    id: "ge-sakpatenti-trademark-portal-name",
    targetId: "ge-sakpatenti-trademark-portal",
    query: "Sakpatenti trademarks Georgia",
  },
  {
    id: "ge-sakpatenti-trademark-filing-name",
    targetId: "ge-sakpatenti-trademark-filing",
    query: "online trademark filing electronic application",
  },
  {
    id: "ge-sakpatenti-trademark-search-name",
    targetId: "ge-sakpatenti-trademark-search",
    query: "trademarks protected in Georgia Nice classes image search",
  },
  {
    id: "ge-sakpatenti-trademark-fees-name",
    targetId: "ge-sakpatenti-trademark-fees",
    query: "trademark fees examination publication registration renewal",
  },
  {
    id: "ge-sakpatenti-trademark-classification-name",
    targetId: "ge-sakpatenti-trademark-classification",
    query: "Nice Classification goods services Vienna marks",
  },
  {
    id: "ge-sakpatenti-trademark-legal-texts-name",
    targetId: "ge-sakpatenti-trademark-legal-texts",
    query: "Trademark Law of Georgia",
  },
  {
    id: "ge-sakpatenti-trademark-practice-name",
    targetId: "ge-sakpatenti-trademark-practice",
    query: "trademark practice distinctiveness likelihood confusion CP3 CP5",
  },
  {
    id: "ge-sakpatenti-trademark-proceedings-name",
    targetId: "ge-sakpatenti-trademark-proceedings",
    query: "trademark registration appeal Chamber of Appeals three months",
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
retrieval_test = retrieval_test.replace("toHaveLength(507)", "toHaveLength(515)", 2)
retrieval_test = retrieval_test.replace("      507,\n", "      515,\n", 1)
ge_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "KZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ge_assertion, "retrieval Georgia jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Georgia Sakpatenti source coverage patch applied")
