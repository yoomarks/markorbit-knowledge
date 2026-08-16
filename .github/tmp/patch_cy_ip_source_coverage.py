from pathlib import Path

priority_path = Path("packages/persistence/src/priority-national-source-coverage.ts")
catalog_path = Path("packages/persistence/src/source-coverage-catalog.ts")
priority_test_path = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
retrieval_path = Path("packages/persistence/src/retrieval-relevance-audit.ts")
retrieval_test_path = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")


def replace_first(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"{label}: anchor not found")
    return text.replace(old, new, 1)

priority = priority_path.read_text()
block = '''const CY_IP: Authority = {
  jurisdiction: "CY",
  authorityName: "Intellectual Property Section, Department of Registrar of Companies and Intellectual Property",
  languages: ["el-CY", "en"],
  verificationEvidenceUri:
    "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
};

export const CY_IP_SOURCE_COVERAGE_TARGETS = [
  target(CY_IP, {
    id: "cy-ip-trademarks",
    family: "PORTAL",
    displayName: "Cyprus Trademark Registration Lifecycle",
    canonicalUri:
      "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
    verificationEvidenceUri:
      "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark",
    notes:
      "The Republic of Cyprus Intellectual Property Section maintains the national trademark lifecycle, registration, management and termination guidance and links the current electronic services.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-filing",
    family: "FILING",
    displayName: "Cyprus FTM02 Trademark Application",
    canonicalUri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/",
    entrypoints: [
      { uri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/", label: "FTM02 application service" },
      { uri: "https://www.gov.cy/en/services/epixeirhmatikh-drasthriothta/eggrafh-ethnikou-emporikou-shmatos/", label: "National trademark services directory" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://www.gov.cy/en/service/ftm02-application-for-trademark/",
    notes:
      "FTM02 is the current national trademark application e-service of the Intellectual Property Section and uses CY Login plus departmental profile activation.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-search",
    family: "SEARCH",
    displayName: "Cyprus Trademarks Register Search",
    canonicalUri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/",
    entrypoints: [
      { uri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/", label: "Search in the Trademarks Register" },
      { uri: "https://www.intellectualproperty.gov.cy/en/21-eservices/esearch", label: "IP eSearch directory" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.gov.cy/en/service/search-in-the-trademark-registry/",
    notes:
      "The current gov.cy service exposes official information from the Cyprus Trademarks Register under the Intellectual Property Section.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-fees",
    family: "FEES",
    displayName: "Cyprus Trademark Forms and Fees",
    canonicalUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/forms-fees",
    verificationEvidenceUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/forms-fees",
    notes:
      "The current official forms-and-fees catalogue lists national trademark filing, renewal, register, opposition and other procedure forms and fees, including the FTM14 opposition fee.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Cyprus FTM03 Goods and Services Classification",
    canonicalUri: "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/",
    entrypoints: [
      { uri: "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/", label: "FTM03 classification service" },
      { uri: "https://www.intellectualproperty.gov.cy/en/intellectual-property-rights/trademark/1-lifecycle/1-registering-a-trademark", label: "Current trademark registration guidance" },
    ],
    verificationEvidenceUri: "https://www.gov.cy/en/service/trademarks-ftm03-change-of-classification-of-goods-and-services/",
    notes:
      "Cyprus maintains a dedicated current e-service for amendment of trademark goods/services classification; the registration lifecycle provides the complementary application context without freezing an unverified Nice-edition page.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Cyprus Trade Marks Law and Regulations",
    canonicalUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/legislation",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/legislation",
    notes:
      "The official legislation catalogue publishes the Trade Marks Law and Trade Marks Regulations governing national trademark registration and proceedings.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Cyprus Trademark Opposition, Revocation and Invalidity Proceedings",
    canonicalUri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/",
    entrypoints: [
      { uri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/", label: "FTM14 opposition" },
      { uri: "https://www.gov.cy/en/services/epixeirhmatikh-drasthriothta/eggrafh-ethnikou-emporikou-shmatos/", label: "FTM14-FTM28 opposition, revocation and invalidity services" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.gov.cy/en/service/trademarks-ftm14-opposition/",
    notes:
      "The current gov.cy trademark service family provides electronic opposition plus supporting-document, hearing, revocation and invalidity procedures through FTM14-FTM28.",
  }),
  target(CY_IP, {
    id: "cy-ip-trademark-gazette",
    family: "OFFICIAL_GAZETTE",
    displayName: "Cyprus Official Gazette Fifth Supplement Part II",
    canonicalUri:
      "https://www.mof.gov.cy/mof/gpo/gazette.nsf/dmlgaz_appsw_gr/dmlgaz_appsw_gr?Click=&Count=1000&OpenDocument=&OpenView=&app=11&cp=21",
    entrypoints: [
      { uri: "https://www.gov.cy/en/service/search-publication-entries-of-trademarks/", label: "Search trademark publication entries" },
      { uri: "https://www.intellectualproperty.gov.cy/en/knowledgebase/gazette", label: "IP Section Gazette knowledgebase" },
    ],
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://www.mof.gov.cy/mof/gpo/gazette.nsf/dmlgaz_appsw_gr/dmlgaz_appsw_gr?Click=&Count=1000&OpenDocument=&OpenView=&app=11&cp=21",
    notes:
      "The Government Printing Office Fifth Supplement Part II publishes trademarks and international trademarks; the current official listing includes multiple 2026 issues through June 2026 and is paired with the live trademark-publication search service.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', block + 'const CIPO: Authority = {', 'insert Cyprus block')
priority = replace_first(priority, '  ...OBI_GR_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,', '  ...OBI_GR_SOURCE_COVERAGE_TARGETS,\n  ...CY_IP_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,', 'aggregate Cyprus')
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
repl = '  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, repl, 'catalog import Cyprus')
catalog = replace_first(catalog, anchor, repl, 'catalog export Cyprus')
catalog_path.write_text(catalog)

pt = priority_test_path.read_text()
pt = replace_first(pt, '  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,', '  OBI_GR_SOURCE_COVERAGE_TARGETS,\n  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,', 'test import Cyprus')
pt = replace_first(pt, '  ["GR", OBI_GR_SOURCE_COVERAGE_TARGETS, ["obi.gr", "gov.gr"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', '  ["GR", OBI_GR_SOURCE_COVERAGE_TARGETS, ["obi.gr", "gov.gr"]],\n  ["CY", CY_IP_SOURCE_COVERAGE_TARGETS, ["gov.cy"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', 'test authority Cyprus')
pt = replace_first(pt, 'ships explicit, official, unique coverage for thirty-two priority national offices', 'ships explicit, official, unique coverage for thirty-three priority national offices', 'office label')
pt = pt.replace('toHaveLength(244)', 'toHaveLength(252)', 1)
pt = pt.replace('      244,\n', '      252,\n', 1)
pt = pt.replace('    ).toBe(244);', '    ).toBe(252);', 1)
priority_test_path.write_text(pt)

retrieval = retrieval_path.read_text()
probes = '''  { id: "cy-trademarks-name", targetId: "cy-ip-trademarks", query: "Cyprus national trademark registration Intellectual Property Section" },
  { id: "cy-trademark-filing-name", targetId: "cy-ip-trademark-filing", query: "Cyprus FTM02 trademark application CY Login" },
  { id: "cy-trademark-search-name", targetId: "cy-ip-trademark-search", query: "Cyprus Trademarks Register search" },
  { id: "cy-trademark-fees-name", targetId: "cy-ip-trademark-fees", query: "Cyprus trademark forms fees opposition FTM14" },
  { id: "cy-trademark-classification-name", targetId: "cy-ip-trademark-classification", query: "Cyprus trademark goods services classification FTM03" },
  { id: "cy-trademark-law-name", targetId: "cy-ip-trademark-law", query: "Cyprus Trade Marks Law Regulations" },
  { id: "cy-trademark-proceedings-name", targetId: "cy-ip-trademark-proceedings", query: "Cyprus trademark opposition revocation invalidity FTM14 FTM27" },
'''
retrieval = replace_first(retrieval, '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },', probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },', 'insert Cyprus probes')
retrieval_path.write_text(retrieval)

rt = retrieval_test_path.read_text()
rt = rt.replace('expect(targets).toHaveLength(246);', 'expect(targets).toHaveLength(253);', 1)
rt = rt.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(246);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(253);', 1)
rt = rt.replace('      246,\n', '      253,\n', 1)
rt = replace_first(rt, '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''', '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GR", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "CY", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''', 'retrieval Cyprus assertion')
retrieval_test_path.write_text(rt)
