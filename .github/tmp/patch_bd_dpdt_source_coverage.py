from pathlib import Path

priority = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = priority.read_text()
marker = "const CIPO: Authority = {"
assert marker in text
block = r'''const DPDT_BD: Authority = {
  jurisdiction: "BD",
  authorityName: "Bangladesh Department of Patents, Industrial Designs and Trademarks (DPDT)",
  languages: ["bn-BD", "en"],
  verificationEvidenceUri: "https://dpdt.gov.bd/",
};

export const DPDT_BD_SOURCE_COVERAGE_TARGETS = [
  target(DPDT_BD, {
    id: "bd-dpdt-trademarks",
    family: "PORTAL",
    displayName: "Bangladesh DPDT Trademark Services",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",
    entrypoints: [
      { uri: "https://dpdt.gov.bd/", label: "Department of Patents, Industrial Designs and Trademarks" },
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",
        label: "Trademark information, filing checklist and Nice classification hub",
      },
    ],
    verificationEvidenceUri: "https://dpdt.gov.bd/",
    notes:
      "DPDT is Bangladesh's national office for patents, industrial designs and trademarks. Its trademark information surface links filing checklists, key forms and Nice classification guidance.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-filing",
    family: "FILING",
    displayName: "Bangladesh DPDT Online Trademark Filing",
    canonicalUri: "https://dpdt.gov.bd/site/page/9fb38fb8-6465-4b33-9808-b48bdfc65bcc/",
    entrypoints: [
      {
        uri: "https://dpdt.gov.bd/site/page/9fb38fb8-6465-4b33-9808-b48bdfc65bcc/",
        label: "DPDT online application gateway",
      },
      { uri: "https://bd.wipo.net/efiling-dashboard", label: "DPDT WIPO-hosted e-filing platform" },
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922e02a933eb65569e25ca3",
        label: "Current online trademark form availability",
      },
    ],
    mode: "MIXED",
    renderJavascriptHint: true,
    verificationEvidenceUri: "https://dpdt.gov.bd/site/page/9fb38fb8-6465-4b33-9808-b48bdfc65bcc/",
    notes:
      "DPDT directs applicants to its WIPO-hosted e-filing platform and maintains a current form-availability page identifying TM-1 registration, TM-4 search, TM-9 publication and other online trademark transactions.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-search",
    family: "SEARCH",
    displayName: "Bangladesh DPDT Trademark Search Request",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922e02a933eb65569e25ca3",
    entrypoints: [
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922e02a933eb65569e25ca3",
        label: "Online TM-4 trademark search application availability",
      },
      {
        uri: "https://dpdt.gov.bd/site/page/2f989f9a-4a13-42c1-9187-8d1a90f5728b/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95%E0%A6%B8",
        label: "Official TM-4 search request form",
      },
    ],
    verificationEvidenceUri: "https://dpdt.gov.bd/pages/static-pages/6922e02a933eb65569e25ca3",
    notes:
      "DPDT currently exposes TM-4 as the official online trademark-search request route. This target intentionally represents the authoritative search-request workflow rather than inventing an unverified public database endpoint.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-fees",
    family: "FEES",
    displayName: "Bangladesh DPDT Trademark Fee Schedule",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922e14d933eb65569e2b677",
    entrypoints: [
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922e14d933eb65569e2b677",
        label: "Revised patent, design and trademark fee schedule",
      },
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922e0cc933eb65569e289fd",
        label: "Trademark fee schedule archive",
      },
      {
        uri: "https://dpdt.gov.bd/pages/notification-circulars/a-challan-%E0%A6%8F%E0%A6%B0-%E0%A6%AE%E0%A6%BE%E0%A6%A7%E0%A7%8D%E0%A6%AF%E0%A6%AE%E0%A7%87-%E0%A6%AB%E0%A6%BF-%E0%A6%AA%E0%A7%8D%E0%A6%B0%E0%A6%A6%E0%A6%BE%E0%A6%A8-9ce4c6-6922d9bedbfbab28ce04fb99",
        label: "2025 A-Challan fee-payment notice",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://dpdt.gov.bd/pages/static-pages/6922e14d933eb65569e2b677",
    notes:
      "DPDT publishes a revised fee schedule covering trademarks, preserves the earlier trademark-specific fee schedule and separately publishes current A-Challan payment instructions. Amounts remain source evidence rather than frozen catalog truth.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-classification",
    family: "GOODS_SERVICES_ID",
    displayName: "Bangladesh DPDT Nice Classification",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",
    entrypoints: [
      {
        uri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",
        label: "DPDT trademark information and Nice Classification entry",
      },
    ],
    verificationEvidenceUri: "https://dpdt.gov.bd/pages/static-pages/6922df0e933eb65569e1f8de",
    notes:
      "DPDT's official trademark-information hub explicitly provides Nice Classification as part of its filing guidance.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Bangladesh Trademark Acts and Rules",
    canonicalUri: "https://dpdt.gov.bd/pages/laws",
    entrypoints: [
      { uri: "https://dpdt.gov.bd/pages/laws", label: "DPDT laws register" },
      {
        uri: "https://dpdt.gov.bd/pages/laws/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95-%E0%A6%86%E0%A6%87%E0%A6%A8-%E0%A7%A8%E0%A7%A6%E0%A7%A6%E0%A7%AF-090dd2-6922d9ff933eb65569e01ade",
        label: "Trademark Act 2009",
      },
      {
        uri: "https://dpdt.gov.bd/pages/legislative-informations/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95-%E0%A6%AC%E0%A6%BF%E0%A6%A7%E0%A6%BF%E0%A6%AE%E0%A6%BE%E0%A6%B2%E0%A6%BE-%E0%A7%A8%E0%A7%A6%E0%A7%A7%E0%A7%AB-a6d394-6922da2b933eb65569e02de8",
        label: "Trademark Rules 2015",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://dpdt.gov.bd/pages/laws",
    notes:
      "DPDT's primary legislation register publishes the Trademark Act 2009, the Trademark Amendment Act 2015 and the Trademark Rules 2015, with downloadable texts.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Bangladesh DPDT Trademark Opposition and Hearing Forms",
    canonicalUri:
      "https://dpdt.gov.bd/site/page/2f989f9a-4a13-42c1-9187-8d1a90f5728b/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95%E0%A6%B8",
    entrypoints: [
      {
        uri: "https://dpdt.gov.bd/site/page/2f989f9a-4a13-42c1-9187-8d1a90f5728b/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95%E0%A6%B8",
        label: "Official TM-5 opposition, TM-6 counterstatement and TM-7 hearing forms",
      },
      { uri: "https://dpdt.gov.bd/pages/forms", label: "Current DPDT forms register" },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri:
      "https://dpdt.gov.bd/site/page/2f989f9a-4a13-42c1-9187-8d1a90f5728b/%E0%A6%9F%E0%A7%8D%E0%A6%B0%E0%A7%87%E0%A6%A1%E0%A6%AE%E0%A6%BE%E0%A6%B0%E0%A7%8D%E0%A6%95%E0%A6%B8",
    notes:
      "DPDT publishes the official trademark proceeding forms, including TM-5 opposition, TM-6 counterstatement and TM-7 hearing/appearance forms, alongside its current forms register.",
  }),
  target(DPDT_BD, {
    id: "bd-dpdt-trademark-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Bangladesh DPDT Trademark Journal",
    canonicalUri: "https://dpdt.gov.bd/pages/static-pages/6922dc84933eb65569e10c76",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://dpdt.gov.bd/pages/static-pages/6922dc84933eb65569e10c76",
    notes:
      "DPDT continuously publishes numbered trademark journal issues as downloadable documents, making the journal a high-value publication and change-signal source.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
text = text.replace(marker, block + marker, 1)
old = "  ...IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  ...IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  ...DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,", 1)
priority.write_text(text)

retrieval = Path("packages/persistence/src/retrieval-relevance-audit.ts")
text = retrieval.read_text()
marker = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
assert marker in text
probes = r'''  {
    id: "bd-trademarks-name",
    targetId: "bd-dpdt-trademarks",
    query: "Bangladesh DPDT trademark services filing Nice classification",
  },
  {
    id: "bd-trademark-filing-name",
    targetId: "bd-dpdt-trademark-filing",
    query: "Bangladesh DPDT online trademark filing TM-1 WIPO efiling",
  },
  {
    id: "bd-trademark-search-name",
    targetId: "bd-dpdt-trademark-search",
    query: "Bangladesh DPDT TM-4 trademark search request",
  },
  {
    id: "bd-trademark-fees-name",
    targetId: "bd-dpdt-trademark-fees",
    query: "Bangladesh DPDT revised trademark fee schedule A-Challan",
  },
  {
    id: "bd-trademark-classification-name",
    targetId: "bd-dpdt-trademark-classification",
    query: "Bangladesh DPDT Nice Classification trademark goods services",
  },
  {
    id: "bd-trademark-law-name",
    targetId: "bd-dpdt-trademark-law",
    query: "Bangladesh Trademark Act 2009 amendment 2015 Trademark Rules 2015 DPDT",
  },
  {
    id: "bd-trademark-proceedings-name",
    targetId: "bd-dpdt-trademark-proceedings",
    query: "Bangladesh DPDT trademark opposition TM-5 counterstatement TM-6 hearing TM-7",
  },
'''
text = text.replace(marker, probes + marker, 1)
retrieval.write_text(text)

catalog = Path("packages/persistence/src/source-coverage-catalog.ts")
text = catalog.read_text()
old = "  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert text.count(old) == 2
text = text.replace(old, "  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,")
catalog.write_text(text)

tests = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
text = tests.read_text()
old = "  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  IPPD_JO_SOURCE_COVERAGE_TARGETS,\n  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,", 1)
old = '  ["JO", IPPD_JO_SOURCE_COVERAGE_TARGETS, ["mit.gov.jo"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
assert old in text
text = text.replace(old, '  ["JO", IPPD_JO_SOURCE_COVERAGE_TARGETS, ["mit.gov.jo"]],\n  ["BD", DPDT_BD_SOURCE_COVERAGE_TARGETS, ["dpdt.gov.bd"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', 1)
text = text.replace('ships explicit, official, unique coverage for forty-six priority national offices', 'ships explicit, official, unique coverage for forty-seven priority national offices', 1)
text = text.replace('toHaveLength(358)', 'toHaveLength(366)', 1)
text = text.replace(').toBe(358);', ').toBe(366);', 2)
tests.write_text(text)

rtests = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")
text = rtests.read_text()
text = text.replace('expect(targets).toHaveLength(344);', 'expect(targets).toHaveLength(351);', 1)
text = text.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(344);', 'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(351);', 1)
text = text.replace(').toBe(344,', ').toBe(351,', 1)
old = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "JO", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
assert old in text
new = old + '''    expect(
      listSourceCoverageTargets({ jurisdiction: "BD", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
text = text.replace(old, new, 1)
rtests.write_text(text)
