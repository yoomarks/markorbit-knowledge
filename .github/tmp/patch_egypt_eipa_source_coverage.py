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
if "EIPA_EG_SOURCE_COVERAGE_TARGETS" in priority:
    print("Egypt EIPA coverage already present")
else:
    eg_block = r'''const EIPA_EG: Authority = {
  jurisdiction: "EG",
  authorityName: "Egyptian Intellectual Property Authority",
  languages: ["ar", "en"],
  verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/22398",
};

export const EIPA_EG_SOURCE_COVERAGE_TARGETS = [
  target(EIPA_EG, {
    id: "eg-eipa-operational-ip-portal",
    family: "PORTAL",
    displayName: "Egyptian IP Operational Portal and Authority Notices",
    canonicalUri: "https://www.egypo.gov.eg/default.aspx?lang=ar",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/22398",
    notes:
      "Operational Egyptian IP web surface during the institutional transition to the Egyptian Intellectual Property Authority; it currently carries EIPA service decisions and hosts the live trademark gazette, but is not treated as a complete trademark e-filing portal.",
  }),
  target(EIPA_EG, {
    id: "eg-eipa-trademark-filing-regulations",
    family: "FILING",
    displayName: "Egypt Trademark Filing and Proceedings Regulations",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/7299",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/7299",
    notes:
      "Prime Minister's Decree No. 1366 of 2003 implementing Law No. 82 of 2002; Book Two covers trademark filing forms, representation, classes, priority, examination, publication, opposition, registration and related procedures.",
  }),
  target(EIPA_EG, {
    id: "eg-eipa-trademark-fee-schedule",
    family: "FEES",
    displayName: "Egypt Trademark Statutory Fee Schedule",
    canonicalUri: "https://www.wipo.int/wipolex/en/text/191778",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/7299",
    notes:
      "WIPO Lex text of the implementing regulations includes the attached trademark fee schedule for filing, publication, registration, opposition, renewal, recordals and pre-filing examination. Catalogued as the statutory schedule, not as a claim that every amount remains the latest administrative service price during the EIPA transition.",
  }),
  target(EIPA_EG, {
    id: "eg-eipa-ip-law-82-current",
    family: "LEGAL_TEXTS",
    displayName: "Egypt Law No. 82 of 2002 on Intellectual Property Rights – Current WIPO Lex Version",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/22066",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/22066",
    notes:
      "Current WIPO Lex version of Egypt's principal intellectual-property statute, amended through Law No. 178 of 2020; Book Two governs trademarks, trade names, geographical indications and industrial designs.",
  }),
  target(EIPA_EG, {
    id: "eg-eipa-establishment-law-163",
    family: "LEGAL_TEXTS",
    displayName: "Egyptian Intellectual Property Authority Establishment Law No. 163 of 2023",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/22398",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/22398",
    notes:
      "Institutional authority law establishing the Egyptian Intellectual Property Authority, effective 7 August 2023; retained to anchor provenance while legacy trademark administration surfaces are being consolidated.",
  }),
  target(EIPA_EG, {
    id: "eg-eipa-trademark-gazette-2026",
    family: "OFFICIAL_GAZETTE",
    displayName: "Egypt Trademark Gazette 2026 Index",
    canonicalUri: "https://www.egypo.gov.eg/page.aspx?id=100&lang=en",
    coverageTier: "CHANGE_SIGNAL",
    fetchAttachmentsHint: true,
    expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "IMAGE"],
    verificationEvidenceUri: "https://www.egypo.gov.eg/page.aspx?id=100&lang=en",
    notes:
      "Live 2026 trademark-gazette index publishing monthly issues and trademark actions including acceptance, registration, renewal, cancellation, ownership changes and licensing; retained as a change signal rather than a foundational retrieval target.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
    priority = replace_once(
        priority,
        "const CIPO: Authority = {",
        eg_block + "const CIPO: Authority = {",
        "CIPO authority",
    )
    priority = replace_once(
        priority,
        "  ...RGD_GH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
        "  ...RGD_GH_SOURCE_COVERAGE_TARGETS,\n  ...EIPA_EG_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
        "priority aggregate",
    )
    write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "EIPA_EG_SOURCE_COVERAGE_TARGETS" not in catalog:
    catalog = replace_once(
        catalog,
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  EIPA_EG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "catalog import",
    )
    catalog = replace_once(
        catalog,
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  EIPA_EG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "catalog export",
    )
    write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
if "EIPA_EG_SOURCE_COVERAGE_TARGETS" not in priority_test:
    priority_test = replace_once(
        priority_test,
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  EIPA_EG_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "priority test import",
    )
    priority_test = replace_once(
        priority_test,
        '  ["GH", RGD_GH_SOURCE_COVERAGE_TARGETS, ["rgd.gov.gh", "wipo.int"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
        '  ["GH", RGD_GH_SOURCE_COVERAGE_TARGETS, ["rgd.gov.gh", "wipo.int"]],\n  ["EG", EIPA_EG_SOURCE_COVERAGE_TARGETS, ["egypo.gov.eg", "wipo.int"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
        "priority authority set",
    )
    priority_test = priority_test.replace(
        "seventy-seven priority national offices",
        "seventy-eight priority national offices",
        1,
    )
    priority_test = priority_test.replace("toHaveLength(624)", "toHaveLength(630)", 1)
    priority_test = priority_test.replace("      624,\n", "      630,\n", 1)
    priority_test = priority_test.replace(").toBe(624);", ").toBe(630);", 1)
    write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "eg-eipa-operational-ip-portal-name" not in retrieval:
    probes = r'''  {
    id: "eg-eipa-operational-ip-portal-name",
    targetId: "eg-eipa-operational-ip-portal",
    query: "Egyptian Intellectual Property Authority Egypt IP portal trademark gazette",
  },
  {
    id: "eg-eipa-trademark-filing-regulations-name",
    targetId: "eg-eipa-trademark-filing-regulations",
    query: "Egypt trademark regulations filing application classes priority examination opposition registration",
  },
  {
    id: "eg-eipa-trademark-fee-schedule-name",
    targetId: "eg-eipa-trademark-fee-schedule",
    query: "Egypt trademark fee schedule filing publication registration opposition renewal recordal",
  },
  {
    id: "eg-eipa-ip-law-82-current-name",
    targetId: "eg-eipa-ip-law-82-current",
    query: "Egypt Law 82 2002 intellectual property trademarks trade names geographical indications",
  },
  {
    id: "eg-eipa-establishment-law-163-name",
    targetId: "eg-eipa-establishment-law-163",
    query: "Egypt Law 163 2023 Egyptian Intellectual Property Authority establishment",
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
if 'jurisdiction: "EG"' not in retrieval_test:
    retrieval_test = retrieval_test.replace("toHaveLength(580)", "toHaveLength(585)", 2)
    retrieval_test = retrieval_test.replace("      580,\n", "      585,\n", 1)
    eg_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "EG", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
    anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
    retrieval_test = replace_once(
        retrieval_test,
        anchor,
        anchor + eg_assertion,
        "retrieval Egypt jurisdiction assertion",
    )
    write(retrieval_test_path, retrieval_test)

print("Egypt EIPA trademark source coverage patch applied")
