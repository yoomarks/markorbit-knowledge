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
if "IPD_HK_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Hong Kong coverage already present")

hk_block = r'''const IPD_HK: Authority = {
  jurisdiction: "HK",
  authorityName: "Hong Kong Intellectual Property Department (IPD)",
  languages: ["en", "zh"],
  verificationEvidenceUri: "https://www.ipd.gov.hk/en/trade-marks/index.html",
};

export const IPD_HK_SOURCE_COVERAGE_TARGETS = [
  target(IPD_HK, {
    id: "hk-ipd-trademark-portal",
    family: "PORTAL",
    displayName: "Hong Kong IPD Trade Marks Portal",
    canonicalUri: "https://www.ipd.gov.hk/en/trade-marks/index.html",
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/trade-marks/index.html",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-filing",
    family: "FILING",
    displayName: "Hong Kong IPD E-Filing System",
    canonicalUri: "https://efiling.ipd.gov.hk/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/online-services/e-filing/index.html",
    notes:
      "IPD's current electronic filing service supports trade mark applications and related electronic submissions.",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-search",
    family: "SEARCH",
    displayName: "Hong Kong IPD Online Trade Mark Search",
    canonicalUri: "https://esearch.ipd.gov.hk/",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/online-services/online-search/index.html",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-forms-fees",
    family: "FEES",
    displayName: "Hong Kong IPD Trade Mark Forms and Fees",
    canonicalUri: "https://www.ipd.gov.hk/en/trade-marks/forms-and-fees/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/trade-marks/forms-and-fees/index.html",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Hong Kong IPD Goods and Services Classification",
    canonicalUri:
      "https://www.ipd.gov.hk/en/trade-marks/apply-for-a-trade-mark/how-to-classify-my-goods-services/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipd.gov.hk/en/trade-marks/apply-for-a-trade-mark/how-to-classify-my-goods-services/index.html",
    notes:
      "IPD states that the 2026 version of the Nice Classification 13th edition applies in Hong Kong from 1 January 2026.",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Hong Kong IPD Trade Mark Laws",
    canonicalUri: "https://www.ipd.gov.hk/en/trade-marks/trade-marks-laws/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/trade-marks/trade-marks-laws/index.html",
    notes: "Official IPD legal index for the Trade Marks Ordinance (Cap. 559) and Trade Marks Rules (Cap. 559A).",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-work-manual",
    family: "EXAMINATION_MANUAL",
    displayName: "Hong Kong Trade Marks Registry Work Manual",
    canonicalUri: "https://www.ipd.gov.hk/en/trade-marks/trade-marks-registry-work-manual/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipd.gov.hk/en/trade-marks/trade-marks-registry-work-manual/index.html",
    notes:
      "Current Registry work manual containing examination and practice chapters, including classification and 2026 procedural updates.",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-opposition",
    family: "PROCEEDINGS",
    displayName: "Hong Kong IPD Trade Mark Opposition",
    canonicalUri: "https://www.ipd.gov.hk/en/trade-marks/managing-your-trade-mark/opposition/index.html",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://www.ipd.gov.hk/en/trade-marks/managing-your-trade-mark/opposition/index.html",
  }),
  target(IPD_HK, {
    id: "hk-ipd-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Hong Kong Intellectual Property Journal – Trade Marks",
    canonicalUri: "https://www.ipd.gov.hk/en/hkipjournal/index.html?cat=1&section=trade",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.ipd.gov.hk/en/hkipjournal/index.html?cat=1&section=trade",
    notes:
      "The official Hong Kong IP Journal publishes trade mark notices regularly, normally weekly; retain it as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", hk_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "IPD_HK_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Hong Kong catalog export already present")
catalog = replace_once(
    catalog,
    "  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...KIPI_KE_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n",
        "  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  ...IPD_HK_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  IPD_HK_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPD_HK_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["KE", KIPI_KE_SOURCE_COVERAGE_TARGETS, ["kipi.go.ke"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["KE", KIPI_KE_SOURCE_COVERAGE_TARGETS, ["kipi.go.ke"]],\n  ["HK", IPD_HK_SOURCE_COVERAGE_TARGETS, ["ipd.gov.hk"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-two priority national offices", "sixty-three priority national offices")
priority_test = priority_test.replace("toHaveLength(495)", "toHaveLength(504)", 1)
priority_test = priority_test.replace("    495,\n", "    504,\n", 1)
priority_test = priority_test.replace(").toBe(495);", ").toBe(504);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "hk-ipd-trademark-portal-name" in retrieval:
    raise SystemExit("Hong Kong retrieval probes already present")
probes = r'''  {
    id: "hk-ipd-trademark-portal-name",
    targetId: "hk-ipd-trademark-portal",
    query: "trade marks Hong Kong",
  },
  {
    id: "hk-ipd-trademark-filing-name",
    targetId: "hk-ipd-trademark-filing",
    query: "trade mark e-filing",
  },
  {
    id: "hk-ipd-trademark-search-name",
    targetId: "hk-ipd-trademark-search",
    query: "online trade mark search",
  },
  {
    id: "hk-ipd-trademark-forms-fees-name",
    targetId: "hk-ipd-trademark-forms-fees",
    query: "trade marks forms fees T2",
  },
  {
    id: "hk-ipd-trademark-classification-name",
    targetId: "hk-ipd-trademark-classification",
    query: "Nice Classification 13th edition 2026",
  },
  {
    id: "hk-ipd-trademark-legal-texts-name",
    targetId: "hk-ipd-trademark-legal-texts",
    query: "Trade Marks Ordinance Cap 559 Rules 559A",
  },
  {
    id: "hk-ipd-trademark-work-manual-name",
    targetId: "hk-ipd-trademark-work-manual",
    query: "Trade Marks Registry Work Manual",
  },
  {
    id: "hk-ipd-trademark-opposition-name",
    targetId: "hk-ipd-trademark-opposition",
    query: "trade mark opposition",
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
retrieval_test = retrieval_test.replace("toHaveLength(465)", "toHaveLength(473)", 2)
retrieval_test = retrieval_test.replace("      465,\n", "      473,\n", 1)
hk_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "HK", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "KE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + hk_assertion, "retrieval Hong Kong jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Hong Kong IPD source coverage patch applied")
