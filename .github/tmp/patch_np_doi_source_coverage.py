from pathlib import Path

priority = Path("packages/persistence/src/priority-national-source-coverage.ts")
text = priority.read_text()
marker = "const CIPO: Authority = {"
assert marker in text
block = r'''const DOI_NP: Authority = {
  jurisdiction: "NP",
  authorityName: "Nepal Department of Industry (DOI)",
  languages: ["ne-NP", "en"],
  verificationEvidenceUri: "https://doind.gov.np/",
};

export const DOI_NP_SOURCE_COVERAGE_TARGETS = [
  target(DOI_NP, {
    id: "np-doi-industrial-property-portal",
    family: "PORTAL",
    displayName: "Nepal Department of Industry Industrial Property Portal",
    canonicalUri: "https://doind.gov.np/",
    entrypoints: [
      { uri: "https://doind.gov.np/", label: "Department of Industry homepage" },
      {
        uri: "https://doind.gov.np/about-us",
        label: "Department mandate including trademark, design and patent registration and protection",
      },
    ],
    verificationEvidenceUri: "https://doind.gov.np/about-us",
    notes:
      "Nepal's Department of Industry, under the Ministry of Industry, Commerce and Supplies, identifies industrial-property registration and protection for trademarks, designs and patents as part of its statutory work.",
  }),
  target(DOI_NP, {
    id: "np-doi-trademark-filing",
    family: "FILING",
    displayName: "Nepal DOI Trademark Registration and Recordal Services",
    canonicalUri: "https://doind.gov.np/industrial-property-section",
    entrypoints: [
      {
        uri: "https://doind.gov.np/industrial-property-section",
        label: "Industrial Property Section trademark registration, renewal and recordal requirements",
      },
      {
        uri: "https://doind.gov.np/citizen-charter-v2",
        label: "Citizen charter for domestic and foreign trademark registration",
      },
    ],
    verificationEvidenceUri: "https://doind.gov.np/industrial-property-section",
    notes:
      "The Industrial Property Section publishes documentary requirements for domestic and foreign trademark registration, trademark renewal, ownership transfer and detail amendments; the citizen charter independently records the domestic and foreign registration services.",
  }),
  target(DOI_NP, {
    id: "np-doi-trademark-fees",
    family: "FEES",
    displayName: "Nepal DOI Trademark Fees and Citizen Charter",
    canonicalUri: "https://doind.gov.np/citizen-charter-v2",
    entrypoints: [
      {
        uri: "https://doind.gov.np/citizen-charter-v2",
        label: "Current citizen charter with trademark application and registration fees",
      },
      {
        uri: "https://doind.gov.np/citizen-charter",
        label: "Department service and fee table",
      },
    ],
    verificationEvidenceUri: "https://doind.gov.np/citizen-charter-v2",
    notes:
      "The Department's citizen charter publishes the required documents, responsible Industrial Property Section and official application/registration fee evidence for domestic and foreign trademarks. Amounts remain sourced evidence rather than frozen catalog truth.",
  }),
  target(DOI_NP, {
    id: "np-doi-trademark-law",
    family: "LEGAL_TEXTS",
    displayName: "Nepal Patent, Design and Trademark Act and Industrial Property Laws",
    canonicalUri: "https://doind.gov.np/laws-and-regulations",
    entrypoints: [
      {
        uri: "https://doind.gov.np/laws-and-regulations",
        label: "Department laws and regulations archive",
      },
      {
        uri: "https://doind.gov.np/detail/fab89350-6a8c-4230-ab46-549721b7fb47",
        label: "Patent, Design and Trademark Act, 2022 (1965)",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://doind.gov.np/laws-and-regulations",
    notes:
      "The Department's primary legal archive publishes the Patent, Design and Trademark Act, 2022 (1965) among its operative industrial-property legal texts, with a dedicated downloadable Act record.",
  }),
  target(DOI_NP, {
    id: "np-doi-trademark-guidelines",
    family: "EXAMINATION_MANUAL",
    displayName: "Nepal DOI Trademark Guidelines",
    canonicalUri: "https://doind.gov.np/detail/49f16d06-a782-4bd9-8639-7aa18535d5e8",
    entrypoints: [
      {
        uri: "https://doind.gov.np/detail/49f16d06-a782-4bd9-8639-7aa18535d5e8",
        label: "Official trademark guideline download",
      },
    ],
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://doind.gov.np/detail/49f16d06-a782-4bd9-8639-7aa18535d5e8",
    notes:
      "DOI publishes an official Trademark Guideline as a downloadable Department document and links related collective-mark guidance from the same guidance surface.",
  }),
  target(DOI_NP, {
    id: "np-doi-trademark-proceedings",
    family: "PROCEEDINGS",
    displayName: "Nepal DOI Industrial Property Complaints and Proceedings Guidance",
    canonicalUri: "https://doind.gov.np/faq",
    entrypoints: [
      {
        uri: "https://doind.gov.np/faq",
        label: "Official FAQ on patent, design and trademark complaint filing",
      },
      {
        uri: "https://doind.gov.np/industrial-property-section",
        label: "Industrial Property Section registration and recordal service context",
      },
    ],
    verificationEvidenceUri: "https://doind.gov.np/faq",
    notes:
      "The Department FAQ states that complaints concerning patents, designs or trademarks are filed with DOI's Law and Decision Implementation Section, preserving an official procedural entrypoint without inferring unverified adjudication rules.",
  }),
  target(DOI_NP, {
    id: "np-doi-industrial-property-bulletin",
    family: "OFFICIAL_GAZETTE",
    displayName: "Nepal DOI Industrial Property Bulletin",
    canonicalUri: "https://doind.gov.np/industrial-property-bulletin",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://doind.gov.np/industrial-property-bulletin",
    notes:
      "DOI continuously publishes numbered Industrial Property Bulletin issues with downloadable files; the current archive includes year 20 issues in 2083 B.S., making this a high-value publication and change-signal source.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
text = text.replace(marker, block + marker, 1)
old = "  ...DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  ...DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  ...DOI_NP_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,", 1)
priority.write_text(text)

retrieval = Path("packages/persistence/src/retrieval-relevance-audit.ts")
text = retrieval.read_text()
marker = '  { id: "ca-trademarks-name", targetId: "ca-cipo-trademarks", query: "trademarks" },'
assert marker in text
probes = r'''  {
    id: "np-industrial-property-portal-name",
    targetId: "np-doi-industrial-property-portal",
    query: "Nepal Department of Industry trademark design patent industrial property",
  },
  {
    id: "np-trademark-filing-name",
    targetId: "np-doi-trademark-filing",
    query: "Nepal DOI domestic foreign trademark registration renewal transfer requirements",
  },
  {
    id: "np-trademark-fees-name",
    targetId: "np-doi-trademark-fees",
    query: "Nepal DOI trademark application registration fees citizen charter",
  },
  {
    id: "np-trademark-law-name",
    targetId: "np-doi-trademark-law",
    query: "Nepal Patent Design and Trademark Act 2022 1965 DOI",
  },
  {
    id: "np-trademark-guidelines-name",
    targetId: "np-doi-trademark-guidelines",
    query: "Nepal DOI official trademark guideline collective mark guideline",
  },
  {
    id: "np-trademark-proceedings-name",
    targetId: "np-doi-trademark-proceedings",
    query: "Nepal DOI trademark complaint Law Decision Implementation Section FAQ",
  },
'''
text = text.replace(marker, probes + marker, 1)
retrieval.write_text(text)

catalog = Path("packages/persistence/src/source-coverage-catalog.ts")
text = catalog.read_text()
old = "  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert text.count(old) == 2
text = text.replace(old, "  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,")
catalog.write_text(text)

tests = Path("packages/persistence/tests/priority-national-source-coverage.test.ts")
text = tests.read_text()
old = "  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,"
assert old in text
text = text.replace(old, "  DPDT_BD_SOURCE_COVERAGE_TARGETS,\n  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,", 1)
old = '  ["BD", DPDT_BD_SOURCE_COVERAGE_TARGETS, ["dpdt.gov.bd"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
assert old in text
text = text.replace(old, '  ["BD", DPDT_BD_SOURCE_COVERAGE_TARGETS, ["dpdt.gov.bd"]],\n  ["NP", DOI_NP_SOURCE_COVERAGE_TARGETS, ["doind.gov.np"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],', 1)
old = '''  it("ships explicit, official, unique coverage for forty-seven priority national offices", () => {
    expect(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS).toHaveLength(366);
    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(
      366,
    );
    expect(
      new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size,
    ).toBe(366);'''
new = '''  it("ships explicit, official, unique coverage for forty-eight priority national offices", () => {
    expect(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS).toHaveLength(373);
    expect(new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.id)).size).toBe(
      373,
    );
    expect(
      new Set(PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS.map((item) => item.canonicalUri)).size,
    ).toBe(373);'''
assert old in text
text = text.replace(old, new, 1)
tests.write_text(text)

rtests = Path("packages/persistence/tests/retrieval-relevance-audit.test.ts")
text = rtests.read_text()
old = '''    expect(targets).toHaveLength(351);
    expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(351);
    expect(new Set(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.id)).size).toBe(
      351,
    );'''
new = '''    expect(targets).toHaveLength(357);
    expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(357);
    expect(new Set(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES.map((probe) => probe.id)).size).toBe(
      357,
    );'''
assert old in text
text = text.replace(old, new, 1)
old = '''    expect(
      listSourceCoverageTargets({ jurisdiction: "BD", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
assert old in text
new = old + '''    expect(
      listSourceCoverageTargets({ jurisdiction: "NP", coverageTier: "FOUNDATIONAL" }).every(
        (target) => targetIds.has(target.id),
      ),
    ).toBe(true);
'''
text = text.replace(old, new, 1)
rtests.write_text(text)
