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
block = '''const IPRD_MT: Authority = {
  jurisdiction: "MT",
  authorityName: "Industrial Property Registrations Directorate, Commerce Department",
  languages: ["mt-MT", "en"],
  verificationEvidenceUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/",
};

export const IPRD_MT_SOURCE_COVERAGE_TARGETS = [
  target(IPRD_MT, {
    id: "mt-iprd-trademarks",
    family: "PORTAL",
    displayName: "Malta Industrial Property Registrations Directorate - Trademarks",
    canonicalUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/trademarks/",
    verificationEvidenceUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/",
    notes:
      "The Industrial Property Registrations Directorate within Malta's Commerce Department is the national authority responsible for trademark registration, amendments, renewals, transfers and cancellations.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-filing",
    family: "FILING",
    displayName: "Malta How to Apply for a Trademark",
    canonicalUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
    entrypoints: [
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/", label: "Current filing guidance" },
      { uri: "https://ips.gov.mt/welcome/?lang=en", label: "Malta IP portal online filing" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "JSON"],
    verificationEvidenceUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/",
    notes:
      "The current filing page directs applicants to the online IP portal, recommends a national pre-application search and explains class selection and the application process.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-search",
    family: "SEARCH",
    displayName: "Malta National Trademark Register",
    canonicalUri: "https://ips.gov.mt/NR/",
    entrypoints: [
      { uri: "https://ips.gov.mt/NR/", label: "National Trademark Register" },
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/searching/", label: "Official search guidance" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    expectedArtifactKinds: ["HTML", "JSON"],
    verificationEvidenceUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/searching/",
    notes:
      "The national register provides public searches by application number, mark name, legal status, Nice class, filing date, applicant and representative; current 2026 records expose publication and opposition-period data.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-fees",
    family: "FEES",
    displayName: "Malta Trademark Fee Schedule",
    canonicalUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/schedule-of-fees-for-trademarks/",
    entrypoints: [
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/schedule-of-fees-for-trademarks/", label: "Trademark fee schedule" },
      { uri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/", label: "Current trademark FAQ and filing fee" },
    ],
    verificationEvidenceUri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    notes:
      "The current Commerce Department FAQ states a €115 fee for a new national trademark covering filing, registration and publication, while the official fee-schedule page remains the procedural fee reference.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Malta Trademark Classification and TMClass Guidance",
    canonicalUri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    entrypoints: [
      { uri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/", label: "Current trademark classification FAQ" },
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/how-to-apply-for-a-trademark/", label: "Current filing/class guidance" },
    ],
    verificationEvidenceUri: "https://commerce.gov.mt/en/frequently-asked-questions-related-to-industrial-property-registrations-directorate/trademark/",
    notes:
      "The current official FAQ uses the 45 Nice goods/services categories and recommends TMClass for accepted terminology. Older static 11th-edition attachments are deliberately not treated as current canonical classification truth.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Malta Trademark Act and Trademark Rules",
    canonicalUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/",
    entrypoints: [
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/", label: "Current trademark-law guidance" },
      { uri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/trademarks-explained/", label: "Trademark Act and Rules reference" },
    ],
    verificationEvidenceUri: "https://commerce.gov.mt/en/industrial-property-registrations-directorate/advice/",
    notes:
      "The current law is primarily the Trademark Act, Act XII of 2019, Chapter 597, with Trademark Rules S.L. 597.04; the official advice page was updated in April 2026.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Malta Trademark Opposition Proceedings",
    canonicalUri: "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/",
    entrypoints: [
      { uri: "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/", label: "Application to oppose a new trademark" },
      { uri: "https://ips.gov.mt/welcome/?lang=en", label: "Online notice of opposition" },
      { uri: "https://commerce.gov.mt/en/intellectual-property/latest-publications/", label: "90-day opposition timing guidance" },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://commerce.gov.mt/en/service/applikazzjoni-biex-topponi-talba-ghal-trejdmark-gdida/",
    notes:
      "A third party may oppose during the publication phase; the official online portal exposes a Notice of Opposition service and the current publication page confirms the 90-day period under S.L. 597.04.",
  }),
  target(IPRD_MT, {
    id: "mt-iprd-ip-online-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Malta IP Online Journal",
    canonicalUri: "https://commerce.gov.mt/en/intellectual-property/latest-publications/",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://commerce.gov.mt/en/intellectual-property/latest-publications/",
    notes:
      "The IP Online Journal is issued weekly on the first working day of the week; the official current page links Publications 2026 and states that trademark publication starts the 90-day opposition period.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_first(priority, 'const CIPO: Authority = {', block + 'const CIPO: Authority = {', 'insert Malta block')
priority = replace_first(priority, '  ...CY_IP_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,', '  ...CY_IP_SOURCE_COVERAGE_TARGETS,\n  ...IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,', 'aggregate Malta')
priority_path.write_text(priority)

catalog = catalog_path.read_text()
anchor = '  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
repl = '  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
catalog = replace_first(catalog, anchor, repl, 'catalog import Malta')
catalog = replace_first(catalog, anchor, repl, 'catalog export Malta')
catalog_path.write_text(catalog)

pt = priority_test_path.read_text()
pt = replace_first(pt, '  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,', '  CY_IP_SOURCE_COVERAGE_TARGETS,\n  IPRD_MT_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,', 'test import Malta')
pt = replace_first(pt, '  ["CY", CY_IP_SOURCE_COVERAGE_TARGETS, ["gov.cy"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', '  ["CY", CY_IP_SOURCE_COVERAGE_TARGETS, ["gov.cy"]],\n  ["MT", IPRD_MT_SOURCE_COVERAGE_TARGETS, ["commerce.gov.mt", "ips.gov.mt"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', 'test authority Malta')
pt = replace_first(pt, 'ships explicit, official, unique coverage for thirty-three priority national offices', 'ships explicit, official, unique coverage for thirty-four priority national offices', 'office label')
pt = pt.replace('toHaveLength(252)', 'toHaveLength(260)', 1)
pt = pt.replace('      252,\n', '      260,\n', 1)
pt = pt.replace('    ).toBe(252);', '    ).toBe(260);', 1)
priority_test_path.write_text(pt)

retrieval = retrieval_path.read_text()
probes = '''  { id: "mt-trademarks-name", targetId: "mt-iprd-trademarks", query: "Malta Industrial Property Registrations Directorate trademarks" },
  { id: "mt-trademark-filing-name", targetId: "mt-iprd-trademark-filing", query: "Malta apply trademark online Commerce Department" },
  { id: "mt-trademark-search-name", targetId: "mt-iprd-trademark-search", query: "Malta National Trademark Register ips" },
  { id: "mt-trademark-fees-name", targetId: "mt-iprd-trademark-fees", query: "Malta trademark fee 115 schedule" },
  { id: "mt-trademark-classification-name", targetId: "mt-iprd-trademark-classification", query: "Malta trademark Nice classes TMClass goods services" },
  { id: "mt-trademark-law-name", targetId: "mt-iprd-trademark-law", query: "Malta Trademark Act Chapter 597 Trademark Rules 597.04" },
  { id: "mt-trademark-proceedings-name", targetId: "mt-iprd-trademark-proceedings", query: "Malta trademark opposition 90 days online" },
'''
retrieval = replace_first(retrieval, '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },', probes + '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },', 'insert Malta probes')
retrieval_path.write_text(retrieval)

rt = retrieval_test_path.read_text()
rt = rt.replace('expect(targets).toHaveLength(253);', 'expect(targets).toHaveLength(260);', 1)
rt = rt.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(253);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(260);', 1)
rt = rt.replace('      253,\n', '      260,\n', 1)
rt = replace_first(rt, '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CY", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''', '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CY", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n    expect(\n      listSourceCoverageTargets({ jurisdiction: "MT", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''', 'retrieval Malta assertion')
retrieval_test_path.write_text(rt)
