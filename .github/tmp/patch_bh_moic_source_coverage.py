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
bahrain_block = '''const MOIC_BH: Authority = {
  jurisdiction: "BH",
  authorityName: "Bahrain Ministry of Industry and Commerce (MOIC)",
  languages: ["ar-BH", "en"],
  verificationEvidenceUri: "https://www.moic.gov.bh/en/service/323",
};

export const MOIC_BH_SOURCE_COVERAGE_TARGETS = [
  target(MOIC_BH, {
    id: "bh-moic-trademarks",
    family: "PORTAL",
    displayName: "Bahrain MOIC Trademarks and Patents",
    canonicalUri: "https://www.moic.gov.bh/en/service/323",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/service/323", label: "Foreign Trade and Industrial Property services" },
      { uri: "https://www.moic.gov.bh/en/node/2795", label: "Trademark Office guidance and contacts" },
    ],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/service/323",
    notes:
      "MOIC's current industrial-property surface links national trademark registration, opposition, grievance, related transactions and the trademark bulletin; the dedicated trademark page identifies the Industrial Property Directorate and representation rules.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-filing",
    family: "FILING",
    displayName: "Bahrain MOIC Industrial Property Trademark e-Services",
    canonicalUri: "https://www.moic.gov.bh/en/node/2705",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/node/2705", label: "Trademark filing and transaction e-services guidance" },
      { uri: "https://service.moic.gov.bh/ipd/login", label: "Industrial Property e-Services login" },
      { uri: "https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=2134", label: "National portal one-class trademark filing service" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/2705",
    notes:
      "MOIC documents electronic national trademark filing and registered-mark transactions, while Bahrain's national service directory exposes the one-class filing service under the Nice International Classification.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-search",
    family: "SEARCH",
    displayName: "Bahrain MOIC WIPO PUBLISH Trademark Search",
    canonicalUri: "https://www.moic.gov.bh/en/node/2705",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/node/2705", label: "MOIC WIPO PUBLISH search entry" },
      { uri: "https://service.moic.gov.bh/ipd", label: "Industrial Property services portal" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/2705",
    notes:
      "MOIC identifies WIPO PUBLISH as the automated search service for trademarks and industrial designs registered in Bahrain.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-fees",
    family: "FEES",
    displayName: "Bahrain MOIC Trademark Service Fees",
    canonicalUri: "https://www.moic.gov.bh/en/node/2795",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/node/2795", label: "Official trademark service fee PDF entry" },
      { uri: "https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=2047", label: "Trademark registration certificate service fee" },
      { uri: "https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=2152", label: "Initial trademark examination fee" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/2795",
    notes:
      "The MOIC trademark page publishes the official Trademarks Services Fees PDF, while Bahrain's national service directory provides live transaction-specific fee evidence. Amounts are intentionally not frozen into catalog truth.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Bahrain MOIC Trademark Goods and Services Classification Guidance",
    canonicalUri: "https://www.moic.gov.bh/en/node/5889",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/node/5889", label: "Trademark Procedure Guidelines including goods/services classification PDF" },
      { uri: "https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=2134", label: "Nice one-class trademark filing evidence" },
      { uri: "https://www.legalaffairs.gov.bh/Legislation/HTM/K1304", label: "Bahrain accession to the Nice Agreement" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/5889",
    notes:
      "MOIC publishes a dedicated classification-of-goods-and-services guideline, and Bahrain's national service directory explicitly describes filing in one class of the Nice International Classification.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Bahrain Trademark Legislation and Legal Regulations",
    canonicalUri: "https://www.legalaffairs.gov.bh/Legislation/Search",
    entrypoints: [
      { uri: "https://www.legalaffairs.gov.bh/Legislation/Search", label: "Legislation and Legal Opinion Commission search" },
      { uri: "https://www.bahrain.bh/wps/portal/en/BNP/ServicesCatalogue/GSX-UI-PServiceDetails?psID=2047", label: "Current trademark registration legal-regulations list" },
      { uri: "https://www.legalaffairs.gov.bh/Legislation/HTM/K1304", label: "Law No. 13 of 2004 approving Bahrain accession to the Nice Agreement" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.legalaffairs.gov.bh/Legislation/Search",
    notes:
      "The Legislation and Legal Opinion Commission provides the primary legislation search, while the current national trademark-registration service enumerates Law No. 6 of 2014 approving the GCC Trademark Law, its 2021 amendment and implementing fee/agent resolutions.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Bahrain MOIC Trademark Opposition and Grievance Procedures",
    canonicalUri: "https://www.moic.gov.bh/en/node/5889",
    entrypoints: [
      { uri: "https://www.moic.gov.bh/en/node/5889", label: "Opposition and grievance procedure guideline PDFs" },
      { uri: "https://www.moic.gov.bh/en/node/2705", label: "Online opposition and grievance filing instructions" },
      { uri: "https://service.moic.gov.bh/ipd/login", label: "Industrial Property opposition/grievance service" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/5889",
    notes:
      "MOIC publishes separate detailed guideline PDFs for grievance and opposition proceedings and provides electronic opposition/grievance filing through the Industrial Property portal.",
  }),
  target(MOIC_BH, {
    id: "bh-moic-trademark-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Bahrain MOIC Trademark Bulletin",
    canonicalUri: "https://www.moic.gov.bh/en/node/2817",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.moic.gov.bh/en/node/2817",
    notes:
      "MOIC continuously publishes numbered weekly trademark bulletin PDFs. The bulletin page states that interested parties may file opposition within 60 days from publication through the Industrial Property portal.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', bahrain_block + 'const CIPO: Authority = {', 'insert Bahrain source block')
priority = replace_first(
    priority,
    '  ...MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    '  ...MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  ...MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,',
    'aggregate Bahrain targets',
)
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
replacement = '  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, replacement, 'catalog import Bahrain targets')
catalog = replace_first(catalog, anchor, replacement, 'catalog export Bahrain targets')
catalog_path.write_text(catalog)

priority_test = priority_test_path.read_text()
priority_test = replace_first(
    priority_test,
    '  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    '  MOCIIP_OM_SOURCE_COVERAGE_TARGETS,\n  MOIC_BH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',
    'priority test import Bahrain targets',
)
priority_test = replace_first(
    priority_test,
    '  ["OM", MOCIIP_OM_SOURCE_COVERAGE_TARGETS, ["gov.om", "mjla.gov.om"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["OM", MOCIIP_OM_SOURCE_COVERAGE_TARGETS, ["gov.om", "mjla.gov.om"]],\n  ["BH", MOIC_BH_SOURCE_COVERAGE_TARGETS, ["moic.gov.bh", "bahrain.bh", "legalaffairs.gov.bh"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    'priority test Bahrain authority set',
)
priority_test = replace_first(
    priority_test,
    'ships explicit, official, unique coverage for forty-three priority national offices',
    'ships explicit, official, unique coverage for forty-four priority national offices',
    'priority office count label',
)
priority_test = replace_first(priority_test, 'toHaveLength(334)', 'toHaveLength(342)', 'priority target count')
priority_test = replace_first(priority_test, '      334,\n', '      342,\n', 'priority id uniqueness count')
priority_test = replace_first(priority_test, '    ).toBe(334);', '    ).toBe(342);', 'priority canonical uniqueness count')
priority_test_path.write_text(priority_test)

retrieval = retrieval_path.read_text()
bahrain_probes = '''  {
    id: "bh-trademarks-name",
    targetId: "bh-moic-trademarks",
    query: "Bahrain MOIC Industrial Property trademark services",
  },
  {
    id: "bh-trademark-filing-name",
    targetId: "bh-moic-trademark-filing",
    query: "Bahrain MOIC trademark electronic filing one class Nice",
  },
  {
    id: "bh-trademark-search-name",
    targetId: "bh-moic-trademark-search",
    query: "Bahrain MOIC WIPO PUBLISH trademark search registered marks",
  },
  {
    id: "bh-trademark-fees-name",
    targetId: "bh-moic-trademark-fees",
    query: "Bahrain MOIC trademark service fees examination registration",
  },
  {
    id: "bh-trademark-classification-name",
    targetId: "bh-moic-trademark-classification",
    query: "Bahrain trademark classification goods services Nice MOIC",
  },
  {
    id: "bh-trademark-law-name",
    targetId: "bh-moic-trademark-law",
    query: "Bahrain Law 6 2014 GCC Trademark Law 2021 amendment legal regulations",
  },
  {
    id: "bh-trademark-proceedings-name",
    targetId: "bh-moic-trademark-proceedings",
    query: "Bahrain MOIC trademark opposition grievance procedure guidelines",
  },
'''
retrieval = replace_first(
    retrieval,
    '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    bahrain_probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },',
    'insert Bahrain retrieval probes',
)
retrieval_path.write_text(retrieval)

retrieval_test = retrieval_test_path.read_text()
retrieval_test = replace_first(retrieval_test, 'expect(targets).toHaveLength(323);', 'expect(targets).toHaveLength(330);', 'foundational target count')
retrieval_test = replace_first(
    retrieval_test,
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(323);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(330);',
    'foundational probe count',
)
retrieval_test = replace_first(retrieval_test, '      323,\n', '      330,\n', 'foundational probe uniqueness count')
retrieval_test = replace_first(
    retrieval_test,
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "OM", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "OM", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "BH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',
    'retrieval test Bahrain jurisdiction assertion',
)
retrieval_test_path.write_text(retrieval_test)
