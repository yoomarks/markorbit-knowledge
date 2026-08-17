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
if "COPAT_AZ_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Azerbaijan coverage already present")

az_block = r'''const COPAT_AZ: Authority = {
  jurisdiction: "AZ",
  authorityName:
    "Intellectual Property Agency of the Republic of Azerbaijan – Patent and Trademark Examination Center",
  languages: ["az", "en", "ru"],
  verificationEvidenceUri: "https://patent.copat.gov.az/mainpage",
};

export const COPAT_AZ_SOURCE_COVERAGE_TARGETS = [
  target(COPAT_AZ, {
    id: "az-copat-trademark-portal",
    family: "PORTAL",
    displayName: "Azerbaijan Patent and Trademark Examination Center – Trademarks",
    canonicalUri: "https://patent.copat.gov.az/mainpage",
    verificationEvidenceUri: "https://patent.copat.gov.az/mainpage",
    notes:
      "Current official Patent and Trademark Examination Center portal with live trademark procedure, classification, fees, legislation, appeal and publication surfaces.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-filing",
    family: "FILING",
    displayName: "Azerbaijan Trademark Filing and Examination Procedure",
    canonicalUri: "https://patent.copat.gov.az/commodity-1",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://patent.copat.gov.az/commodity-1",
    notes:
      "Official trademark application procedure covering filing requirements, Nice-class goods/services, preliminary examination and substantive examination.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-search",
    family: "SEARCH",
    displayName: "Azerbaijan Industrial Property Trademark Register",
    canonicalUri: "https://reyestr.copat.az/trademarks",
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://reyestr.copat.az/trademarks",
    notes:
      "Official industrial-property register search for trademarks, including registration/application, date, Nice class, description and holder fields.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-fees",
    family: "FEES",
    displayName: "Azerbaijan Trademark Service Fees",
    canonicalUri:
      "https://patent.copat.gov.az/files//21560273462512122188Xidmet%20haqlari_.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri:
      "https://patent.copat.gov.az/legislation-decisions-of-the-cabinet-of-ministers-of-the-republic-of-azerbaijan",
    notes:
      "Official service-fee schedule covering trademark preliminary examination, examination, registration-related and renewal actions.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Azerbaijan Nice Classification Goods and Services",
    canonicalUri: "https://patent.copat.gov.az/commodity-3",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "XLSX"],
    verificationEvidenceUri: "https://patent.copat.gov.az/commodity-3",
    notes:
      "Official international classification page providing Azerbaijani goods/services material with Nice references and downloadable source files.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Azerbaijan Trademark and Geographical Indications Law",
    canonicalUri: "https://patent.copat.gov.az/legislation-laws",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://patent.copat.gov.az/legislation-laws",
    notes:
      "Official legislation index containing the Law on Trademarks and Geographical Indications and related amendments and state-duty materials.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-examination-rules",
    family: "EXAMINATION_MANUAL",
    displayName: "Azerbaijan Trademark Filing and Examination Rules",
    canonicalUri:
      "https://patent.copat.gov.az/legislation-decisions-of-the-cabinet-of-ministers-of-the-republic-of-azerbaijan",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://patent.copat.gov.az/legislation-decisions-of-the-cabinet-of-ministers-of-the-republic-of-azerbaijan",
    notes:
      "Official Cabinet-of-Ministers decision index covering trademark filing/examination rules, state-register rules, certificate forms, contract-registration rules, well-known marks and service fees.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Azerbaijan Appeal Board Decisions",
    canonicalUri: "https://patent.copat.gov.az/decisions-of-the-appealsboard.php",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri:
      "https://patent.copat.gov.az/legislation-decisions-of-the-cabinet-of-ministers-of-the-republic-of-azerbaijan",
    notes:
      "Official Appeal Board decisions and governing procedure for trademark refusals, registration challenges, invalidity/non-use and well-known-mark disputes.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-renewal",
    family: "MAINTENANCE",
    displayName: "Azerbaijan Trademark Renewal and Register Forms",
    canonicalUri: "https://patent.copat.gov.az/commodity-2",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://patent.copat.gov.az/commodity-2",
    notes:
      "Official trademark forms include the application to extend registration for the next ten-year period plus owner/name/address and related register-change forms.",
  }),
  target(COPAT_AZ, {
    id: "az-copat-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Azerbaijan Official Trademark and Geographical Indications Bulletin",
    canonicalUri: "https://patent.copat.gov.az/publish-trademarks-and-geographical-indications",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://patent.copat.gov.az/year-trademarks-2026",
    notes:
      "Rolling official trademark and geographical-indications bulletin index; current 2026 issues are retained as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", az_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  ...COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "COPAT_AZ_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Azerbaijan catalog export already present")
catalog = replace_once(
    catalog,
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
catalog = replace_once(
    catalog,
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog export",
)
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  AIPO_AM_SOURCE_COVERAGE_TARGETS,\n  COPAT_AZ_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["AM", AIPO_AM_SOURCE_COVERAGE_TARGETS, ["aipo.am"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["AM", AIPO_AM_SOURCE_COVERAGE_TARGETS, ["aipo.am"]],\n  ["AZ", COPAT_AZ_SOURCE_COVERAGE_TARGETS, ["copat.gov.az", "copat.az"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("seventy priority national offices", "seventy-one priority national offices")
priority_test = priority_test.replace("toHaveLength(570)", "toHaveLength(580)", 1)
priority_test = priority_test.replace("    570,\n", "    580,\n", 1)
priority_test = priority_test.replace(").toBe(570);", ").toBe(580);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "az-copat-trademark-portal-name" in retrieval:
    raise SystemExit("Azerbaijan retrieval probes already present")
probes = r'''  {
    id: "az-copat-trademark-portal-name",
    targetId: "az-copat-trademark-portal",
    query: "Azerbaijan Intellectual Property Agency trademarks",
  },
  {
    id: "az-copat-trademark-filing-name",
    targetId: "az-copat-trademark-filing",
    query: "əmtəə nişanının qeydiyyata alınması iddia sənədi ekspertiza",
  },
  {
    id: "az-copat-trademark-search-name",
    targetId: "az-copat-trademark-search",
    query: "əmtəə nişanları reyestr Nitsa qeydiyyat nömrəsi",
  },
  {
    id: "az-copat-trademark-fees-name",
    targetId: "az-copat-trademark-fees",
    query: "əmtəə nişanı ilkin ekspertiza ekspertiza xidmət haqları",
  },
  {
    id: "az-copat-trademark-classification-name",
    targetId: "az-copat-trademark-classification",
    query: "ƏXBT Nitsa əmtəə xidmət beynəlxalq təsnifatı",
  },
  {
    id: "az-copat-trademark-legal-texts-name",
    targetId: "az-copat-trademark-legal-texts",
    query: "Əmtəə nişanları coğrafi göstəricilər haqqında Qanun",
  },
  {
    id: "az-copat-trademark-examination-rules-name",
    targetId: "az-copat-trademark-examination-rules",
    query: "əmtəə nişanlarının qeydə alınması iddia sənədinin verilməsi ekspertizası Qaydaları",
  },
  {
    id: "az-copat-trademark-proceedings-name",
    targetId: "az-copat-trademark-proceedings",
    query: "Apellyasiya şurası əmtəə nişanı qərarları etiraz",
  },
  {
    id: "az-copat-trademark-renewal-name",
    targetId: "az-copat-trademark-renewal",
    query: "əmtəə nişanı qeydiyyat müddətinin növbəti 10 il uzadılması",
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
retrieval_test = retrieval_test.replace("toHaveLength(532)", "toHaveLength(541)", 2)
retrieval_test = retrieval_test.replace("      532,\n", "      541,\n", 1)
az_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AZ", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "AM", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + az_assertion, "retrieval Azerbaijan jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Azerbaijan COPAT trademark source coverage patch applied")
