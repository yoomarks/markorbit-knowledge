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
if "AIPO_AM_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Armenia coverage already present")

am_block = r'''const AIPO_AM: Authority = {
  jurisdiction: "AM",
  authorityName: "Intellectual Property Office of the Republic of Armenia (AIPO)",
  languages: ["hy", "en", "ru"],
  verificationEvidenceUri: "https://aipo.am/en/pages/show/trademarks",
};

export const AIPO_AM_SOURCE_COVERAGE_TARGETS = [
  target(AIPO_AM, {
    id: "am-aipo-trademark-portal",
    family: "PORTAL",
    displayName: "Armenia AIPO Trademarks Portal",
    canonicalUri: "https://aipo.am/en/pages/show/trademarks",
    verificationEvidenceUri: "https://aipo.am/en/pages/show/trademarks",
    notes:
      "Current AIPO trademark hub linking forms, fees, Nice classification, national and international search, legislation and published applications.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-filing",
    family: "FILING",
    displayName: "Armenia AIPO Trademark Filing Guidance",
    canonicalUri: "https://aipo.am/en/pages/show/frequently-asked-questions",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://aipo.am/en/pages/show/frequently-asked-questions",
    notes:
      "AIPO's current trademark FAQ specifies filing by post, in person or electronically through the Office electronic filing system via aipo.am, and gives the filing/examination/registration fee sequence. A hidden session URL is deliberately not inferred.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-search",
    family: "SEARCH",
    displayName: "Armenia AIPO National Trademark Search",
    canonicalUri: "https://aipo.am/en/national-procedure-reg",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://aipo.am/en/national-procedure-reg",
    notes:
      "Official national-procedure trademark register search with application, registration, mark, goods/services, Nice class and holder fields.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-fees",
    family: "FEES",
    displayName: "Armenia AIPO Trademark Fees and Payment",
    canonicalUri: "https://aipo.am/en/pages/show/payment-method-2",
    verificationEvidenceUri: "https://aipo.am/en/pages/show/payment-method-2",
    notes:
      "Official trademark-specific payment page covering state fees for filing, examination, registration, search and renewal actions.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Armenia AIPO Nice Classification 13-2026",
    canonicalUri: "https://aipo.am/hy/pages/show/nice1",
    verificationEvidenceUri: "https://aipo.am/hy/pages/show/nice1",
    notes:
      "Official AIPO Nice Classification page explicitly identifying the 13th edition, 2026 version and classes 1 through 45.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Armenia Trademark Law",
    canonicalUri: "https://aipo.am/en/pages/show/trademarklaw",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://aipo.am/en/pages/show/trademarklaw",
    notes:
      "Official AIPO publication of the Republic of Armenia Trademark Law governing electronic filing, examination, publication, oppositions, registration and renewal.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Armenia AIPO Board of Appeal",
    canonicalUri: "https://aipo.am/en/pages/show/board-of-appeal",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://aipo.am/en/pages/show/board-of-appeal",
    notes:
      "Official AIPO Board of Appeal hub covering trademark-related appeals, legal-protection disputes and published Board decisions, including 2026 decisions.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Armenia AIPO Trademark Renewal Forms",
    canonicalUri: "https://aipo.am/hy/pages/show/forms-register",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "DOC", "PDF"],
    verificationEvidenceUri: "https://aipo.am/hy/pages/show/Frequently_asked_Questions_6",
    notes:
      "Official trademark register forms include the application to extend a trademark registration. AIPO guidance and the Trademark Law provide the ten-year renewal cycle and post-expiry six-month grace period.",
  }),
  target(AIPO_AM, {
    id: "am-aipo-official-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Armenia AIPO Industrial Property Official Bulletin",
    canonicalUri: "https://aipo.am/en/pages/show/official-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://aipo.am/en/pages/show/trademark-applications",
    notes:
      "AIPO publishes the Industrial Property official bulletin and separate trademark-application publication issues throughout 2026; retain the official bulletin as a publication change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", am_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  ...AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "AIPO_AM_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Armenia catalog export already present")
catalog = replace_once(
    catalog,
    "  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n",
        "  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  ...AIPO_AM_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["MD", AGEPI_MD_SOURCE_COVERAGE_TARGETS, ["agepi.gov.md", "agepi.md"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["MD", AGEPI_MD_SOURCE_COVERAGE_TARGETS, ["agepi.gov.md", "agepi.md"]],\n  ["AM", AIPO_AM_SOURCE_COVERAGE_TARGETS, ["aipo.am"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-nine priority national offices", "seventy priority national offices")
priority_test = priority_test.replace("toHaveLength(561)", "toHaveLength(570)", 1)
priority_test = priority_test.replace("    561,\n", "    570,\n", 1)
priority_test = priority_test.replace(").toBe(561);", ").toBe(570);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "am-aipo-trademark-portal-name" in retrieval:
    raise SystemExit("Armenia retrieval probes already present")
probes = r'''  {
    id: "am-aipo-trademark-portal-name",
    targetId: "am-aipo-trademark-portal",
    query: "AIPO trademarks Armenia",
  },
  {
    id: "am-aipo-trademark-filing-name",
    targetId: "am-aipo-trademark-filing",
    query: "trademark electronic filing application Armenia",
  },
  {
    id: "am-aipo-trademark-search-name",
    targetId: "am-aipo-trademark-search",
    query: "national procedure trademark search Nice holder",
  },
  {
    id: "am-aipo-trademark-fees-name",
    targetId: "am-aipo-trademark-fees",
    query: "trademark filing examination registration renewal fees AMD",
  },
  {
    id: "am-aipo-trademark-classification-name",
    targetId: "am-aipo-trademark-classification",
    query: "Nice 13 2026 classification Armenia",
  },
  {
    id: "am-aipo-trademark-legal-texts-name",
    targetId: "am-aipo-trademark-legal-texts",
    query: "Armenia Trademark Law application examination opposition renewal",
  },
  {
    id: "am-aipo-trademark-proceedings-name",
    targetId: "am-aipo-trademark-proceedings",
    query: "Board of Appeal trademark decisions Armenia",
  },
  {
    id: "am-aipo-trademark-renewal-name",
    targetId: "am-aipo-trademark-renewal",
    query: "trademark registration renewal form ten years six months",
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
retrieval_test = retrieval_test.replace("toHaveLength(524)", "toHaveLength(532)", 2)
retrieval_test = retrieval_test.replace("      524,\n", "      532,\n", 1)
am_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AM", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MD", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + am_assertion, "retrieval Armenia jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Armenia AIPO source coverage patch applied")
