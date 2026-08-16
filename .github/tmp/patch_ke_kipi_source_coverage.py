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
if "KIPI_KE_SOURCE_COVERAGE_TARGETS" in priority:
    raise SystemExit("Kenya coverage already present")

ke_block = r'''const KIPI_KE: Authority = {
  jurisdiction: "KE",
  authorityName: "Kenya Industrial Property Institute (KIPI)",
  languages: ["en"],
  verificationEvidenceUri: "https://kipi.go.ke/trade-marks",
};

export const KIPI_KE_SOURCE_COVERAGE_TARGETS = [
  target(KIPI_KE, {
    id: "ke-kipi-trademark-portal",
    family: "PORTAL",
    displayName: "Kenya KIPI Trade Marks Portal and Procedure",
    canonicalUri: "https://kipi.go.ke/trade-marks",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://kipi.go.ke/trade-marks",
    notes:
      "KIPI's current trademark procedure page explains registration requirements and states that marks are classified under the Nice Classification currently in the 13th edition. The page still links an older 12th-edition download, so that stale file is not cataloged as a current classification source.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-filing",
    family: "FILING",
    displayName: "Kenya KIPI TM2 Trademark Application Form",
    canonicalUri: "https://kipi.go.ke/node/438",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://kipi.go.ke/node/438",
    notes:
      "Official TM2 application form page, submitted by KIPI on 13 January 2026. KIPI's separate 2026 online-filing system currently covers patents, industrial designs and utility models rather than trademarks, so no trademark e-filing endpoint is inferred here.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-search",
    family: "SEARCH",
    displayName: "Kenya KIPI TM27 Trademark Search and Preliminary Advice",
    canonicalUri: "https://kipi.go.ke/node/283",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://kipi.go.ke/node/283",
    notes:
      "TM27 is KIPI's official application for a trademark search under rule 114 and for preliminary advice as to distinctiveness; no unsupported public live-search database is inferred.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-forms",
    family: "FILING",
    displayName: "Kenya KIPI Patent and Trademark Forms",
    canonicalUri: "https://www.kipi.go.ke/node/225",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.kipi.go.ke/node/225",
    notes:
      "Official forms catalogue including TM1, TM2, TM6 opposition, TM7 counter-statement, TM10 renewal and other trademark forms.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-fees",
    family: "FEES",
    displayName: "Kenya KIPI Trade Marks Fees Schedule",
    canonicalUri: "https://kipi.go.ke/fees-schedules",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://kipi.go.ke/fees-schedules",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-legal-texts",
    family: "LEGAL_TEXTS",
    displayName: "Kenya KIPI Laws and Regulations",
    canonicalUri: "https://www.kipi.go.ke/laws-and-regulations",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF"],
    verificationEvidenceUri: "https://www.kipi.go.ke/laws-and-regulations",
    notes: "Official KIPI legal index containing the Trademarks Act and related IP legislation and regulations.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-trademark-rulings",
    family: "PROCEEDINGS",
    displayName: "Kenya KIPI Trade Mark Rulings",
    canonicalUri: "https://www.kipi.go.ke/trade-mark-rulings",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.kipi.go.ke/trade-mark-rulings",
    notes:
      "Official KIPI rulings collection covering opposition, expungement and ex-parte trademark proceedings.",
  }),
  target(KIPI_KE, {
    id: "ke-kipi-ip-journal",
    family: "OFFICIAL_GAZETTE",
    displayName: "Kenya KIPI Industrial Property Journal",
    canonicalUri: "https://www.kipi.go.ke/ip-journal",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "PDF"],
    verificationEvidenceUri: "https://www.kipi.go.ke/ip-journal",
    notes:
      "KIPI publishes monthly Industrial Property Journals, with 2026 issues listed through June; retain the journal as a publication change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
priority = replace_once(priority, "const CIPO: Authority = {", ke_block + "const CIPO: Authority = {", "CIPO authority")
priority = replace_once(
    priority,
    "  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
    "priority aggregate",
)
write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "KIPI_KE_SOURCE_COVERAGE_TARGETS" in catalog:
    raise SystemExit("Kenya catalog export already present")
catalog = replace_once(
    catalog,
    "  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "catalog import",
)
if "  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS," in catalog:
    catalog = replace_once(
        catalog,
        "  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n",
        "  ...INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  ...KIPI_KE_SOURCE_COVERAGE_TARGETS,\n",
        "catalog aggregate spread",
    )
elif catalog.count("  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n") >= 2:
    first = catalog.find("  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n")
    second = catalog.find("  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n", first + 1)
    insert_at = second + len("  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n")
    catalog = catalog[:insert_at] + "  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n" + catalog[insert_at:]
write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
priority_test = replace_once(
    priority_test,
    "  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "  INDECOPI_PE_SOURCE_COVERAGE_TARGETS,\n  KIPI_KE_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
    "priority test import",
)
priority_test = replace_once(
    priority_test,
    '  ["PE", INDECOPI_PE_SOURCE_COVERAGE_TARGETS, ["gob.pe"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    '  ["PE", INDECOPI_PE_SOURCE_COVERAGE_TARGETS, ["gob.pe"]],\n  ["KE", KIPI_KE_SOURCE_COVERAGE_TARGETS, ["kipi.go.ke"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
    "priority authority set",
)
priority_test = priority_test.replace("sixty-one priority national offices", "sixty-two priority national offices")
priority_test = priority_test.replace("toHaveLength(487)", "toHaveLength(495)", 1)
priority_test = priority_test.replace("    487,\n", "    495,\n", 1)
priority_test = priority_test.replace(").toBe(487);", ").toBe(495);", 1)
write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "ke-kipi-trademark-portal-name" in retrieval:
    raise SystemExit("Kenya retrieval probes already present")
probes = r'''  {
    id: "ke-kipi-trademark-portal-name",
    targetId: "ke-kipi-trademark-portal",
    query: "trade marks Nice 13th edition",
  },
  {
    id: "ke-kipi-trademark-filing-name",
    targetId: "ke-kipi-trademark-filing",
    query: "TM2 application registration mark",
  },
  {
    id: "ke-kipi-trademark-search-name",
    targetId: "ke-kipi-trademark-search",
    query: "TM27 search preliminary advice distinctiveness",
  },
  {
    id: "ke-kipi-trademark-forms-name",
    targetId: "ke-kipi-trademark-forms",
    query: "trademark forms TM6 TM10",
  },
  {
    id: "ke-kipi-trademark-fees-name",
    targetId: "ke-kipi-trademark-fees",
    query: "trade marks fees schedule",
  },
  {
    id: "ke-kipi-trademark-legal-texts-name",
    targetId: "ke-kipi-trademark-legal-texts",
    query: "Trademarks Act Kenya",
  },
  {
    id: "ke-kipi-trademark-rulings-name",
    targetId: "ke-kipi-trademark-rulings",
    query: "trade mark rulings opposition expungement",
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
retrieval_test = retrieval_test.replace("toHaveLength(458)", "toHaveLength(465)", 2)
retrieval_test = retrieval_test.replace("      458,\n", "      465,\n", 1)
ke_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "KE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PE", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
retrieval_test = replace_once(retrieval_test, anchor, anchor + ke_assertion, "retrieval Kenya jurisdiction assertion")
write(retrieval_test_path, retrieval_test)

print("Kenya KIPI source coverage patch applied")
