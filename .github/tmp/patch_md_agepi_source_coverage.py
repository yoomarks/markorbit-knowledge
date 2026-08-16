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
if "AGEPI_MD_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Moldova coverage already present")

md_block = r'''const AGEPI_MD: Authority = {
  jurisdiction: "MD",
  authorityName: "State Agency on Intellectual Property of the Republic of Moldova (AGEPI)",
  languages: ["ro", "en", "ru"],
  verificationEvidenceUri: "https://www.agepi.gov.md/en/content/trademarks",
};

export const AGEPI_MD_SOURCE_COVERAGE_TARGETS = [
  target(AGEPI_MD, {
    id: "md-agepi-trademark-portal",
    family: "PORTAL",
    displayName: "Moldova AGEPI Trademarks Portal",
    canonicalUri: "https://www.agepi.gov.md/en/content/trademarks",
    verificationEvidenceUri: "https://www.agepi.gov.md/en/content/trademarks",
    notes:
      "Current AGEPI trademark hub linking classification, national databases, legislation, online filing and forms.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-filing",
    family: "FILING",
    displayName: "Moldova AGEPI Online Trademark Filing",
    canonicalUri: "https://e-servicii.agepi.gov.md/ro/user/register",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://agepi.gov.md/en/trademarks/national-registration-and-renewal",
    notes:
      "AGEPI's current national-registration guidance directs applicants to the official electronic online-submission service; the authenticated service may require browser rendering.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-search",
    family: "SEARCH",
    displayName: "Moldova AGEPI National Trademark Database",
    canonicalUri: "https://www.db.agepi.md/marcireprezentanti/Search.aspx",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.agepi.gov.md/en/trademarks/presentation",
    notes:
      "Official AGEPI national trademark database for free searching of Moldovan applications and registrations; the live database carries a current 2026 update date.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-fees",
    family: "FEES",
    displayName: "Moldova AGEPI Trademark Fees",
    canonicalUri: "https://agepi.gov.md/en/node/8067",
    verificationEvidenceUri: "https://agepi.gov.md/en/node/8067",
    notes:
      "Current legal-significance trademark fee schedule covering filing, substantive examination, registration, appeal and renewal, with the official fee calculator linked by AGEPI.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Moldova AGEPI Nice Classification NCL(13-2026)",
    canonicalUri: "https://www.agepi.gov.md/ro/trademarks/classifications",
    verificationEvidenceUri: "https://www.agepi.gov.md/ro/trademarks/classifications",
    notes:
      "Official AGEPI classification page listing the 13th edition, 2026 version of the Nice Classification effective from 1 January 2026.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Moldova AGEPI Trademark Legislation",
    canonicalUri: "https://agepi.gov.md/en/legislatie/trademarks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://agepi.gov.md/en/legislatie/trademarks",
    notes:
      "Official AGEPI trademark legislation index. It distinguishes the currently applicable Law No. 38-XVI/2008 from Law No. 25/2024, which is expressly scheduled to enter into force on 2 April 2027.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-requirements",
    family: "EXAMINATION_MANUAL",
    displayName: "Moldova AGEPI Trademark Application Requirements",
    canonicalUri: "https://agepi.gov.md/en/trademarks/requirements",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://agepi.gov.md/en/trademarks/requirements",
    notes:
      "Current official application-material and representation requirements, including the goods/services list and Nice-class ordering requirements.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Moldova AGEPI Trademark Opposition and Appeals",
    canonicalUri: "https://www.agepi.gov.md/en/appeals-board",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://agepi.gov.md/en/trademarks/national-registration-and-renewal",
    notes:
      "AGEPI's national trademark procedure provides a three-month opposition period and appeal routes, while the Appeals Board is the official extrajudicial IP dispute body.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Moldova AGEPI Trademark Renewal",
    canonicalUri: "https://agepi.gov.md/en/trademarks/national-registration-and-renewal",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
    verificationEvidenceUri: "https://agepi.gov.md/en/trademarks/national-registration-and-renewal",
    notes:
      "Official national registration and renewal procedure: ten-year protection, renewal during the final six months or the six-month grace period, and publication of renewal in BOPI.",
  }),
  target(AGEPI_MD, {
    id: "md-agepi-bopi",
    family: "OFFICIAL_GAZETTE",
    displayName: "Moldova AGEPI Official Bulletin of Industrial Property (BOPI)",
    canonicalUri: "https://agepi.gov.md/en/bopi/1-2026",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://agepi.gov.md/en/bopi/1-2026",
    notes:
      "The official 2026 BOPI issue archive publishes trademark notices, legal-status changes and Appeals Board decisions; retain the bulletin as a publication change signal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", md_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "AGEPI_MD_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Moldova catalog export already present")
catalog = replace_once(
    catalog,
    "  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n",
        "  ...SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  ...AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS,\n  AGEPI_MD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["GE", SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS, ["sakpatenti.gov.ge"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["GE", SAKPATENTI_GE_SOURCE_COVERAGE_TARGETS, ["sakpatenti.gov.ge"]],\n  ["MD", AGEPI_MD_SOURCE_COVERAGE_TARGETS, ["agepi.gov.md", "agepi.md"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-eight priority national offices", "sixty-nine priority national offices")
priority_test = priority_test.replace("toHaveLength(551)", "toHaveLength(561)", 1)
priority_test = priority_test.replace("    551,\n", "    561,\n", 1)
priority_test = priority_test.replace(").toBe(551);", ").toBe(561);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "md-agepi-trademark-portal-name" in retrieval:
    raise SystemExit("Moldova retrieval probes already present")
probes = r'''  {
    id: "md-agepi-trademark-portal-name",
    targetId: "md-agepi-trademark-portal",
    query: "AGEPI trademarks Moldova",
  },
  {
    id: "md-agepi-trademark-filing-name",
    targetId: "md-agepi-trademark-filing",
    query: "online submission trademark application AGEPI",
  },
  {
    id: "md-agepi-trademark-search-name",
    targetId: "md-agepi-trademark-search",
    query: "national trademark database Moldova marks",
  },
  {
    id: "md-agepi-trademark-fees-name",
    targetId: "md-agepi-trademark-fees",
    query: "trademark filing examination registration renewal fees",
  },
  {
    id: "md-agepi-trademark-classification-name",
    targetId: "md-agepi-trademark-classification",
    query: "NCL 13-2026 Nice Classification Moldova",
  },
  {
    id: "md-agepi-trademark-legal-texts-name",
    targetId: "md-agepi-trademark-legal-texts",
    query: "Law 38 2008 Law 25 2024 trademarks",
  },
  {
    id: "md-agepi-trademark-requirements-name",
    targetId: "md-agepi-trademark-requirements",
    query: "trademark application requirements goods services representative",
  },
  {
    id: "md-agepi-trademark-proceedings-name",
    targetId: "md-agepi-trademark-proceedings",
    query: "trademark opposition Appeals Board AGEPI",
  },
  {
    id: "md-agepi-trademark-renewal-name",
    targetId: "md-agepi-trademark-renewal",
    query: "trademark renewal ten years six month grace period",
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
retrieval_test = retrieval_test.replace("toHaveLength(515)", "toHaveLength(524)", 2)
retrieval_test = retrieval_test.replace("      515,\n", "      524,\n", 1)
md_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MD", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + md_assertion, "retrieval Moldova jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Moldova AGEPI source coverage patch applied")
