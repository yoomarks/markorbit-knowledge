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
if "RGD_GH_SOURCE_COVERAGE_TARGETS" in priority:
    print("Ghana coverage already present")
else:
    gh_block = r'''const RGD_GH: Authority = {
  jurisdiction: "GH",
  authorityName: "Ghana Registrar-General's Department – Industrial Property Registry",
  languages: ["en"],
  verificationEvidenceUri: "https://www.rgd.gov.gh/About-Us.html",
};

export const RGD_GH_SOURCE_COVERAGE_TARGETS = [
  target(RGD_GH, {
    id: "gh-rgd-industrial-property-portal",
    family: "PORTAL",
    displayName: "Ghana Registrar-General's Department Industrial Property Mandate",
    canonicalUri: "https://www.rgd.gov.gh/About-Us.html",
    verificationEvidenceUri: "https://www.rgd.gov.gh/About-Us.html",
    notes:
      "Official Registrar-General's Department mandate page confirming responsibility for industrial-property administration under Ghana's Ministry of Justice framework.",
  }),
  target(RGD_GH, {
    id: "gh-rgd-trademark-fees",
    family: "FEES",
    displayName: "Ghana Trademark Registration Procedure and Fee Schedule",
    canonicalUri: "https://rgd.gov.gh/Industrial%20Property.html",
    verificationEvidenceUri: "https://rgd.gov.gh/Industrial%20Property.html",
    notes:
      "Current RGD trademark service page covering preliminary search, application, examination, publication/opposition, certification, ten-year renewal and the published trademark fee schedule.",
  }),
  target(RGD_GH, {
    id: "gh-rgd-trademark-regulations",
    family: "FILING",
    displayName: "Ghana Trade Marks Regulations, 1970 (L.I. 667)",
    canonicalUri: "https://www.wipo.int/edocs/lexdocs/laws/en/gh/gh027en.pdf",
    expectedArtifactKinds: ["PDF"],
    verificationEvidenceUri: "https://www.wipo.int/edocs/lexdocs/laws/en/gh/gh027en.pdf",
    notes:
      "Implementing trademark regulations directly linked by the RGD trademark service page; covers applications, Registrar searches, examination, opposition, renewal, assignments, register actions, fees and prescribed forms.",
  }),
  target(RGD_GH, {
    id: "gh-rgd-trademarks-act-2004",
    family: "LEGAL_TEXTS",
    displayName: "Ghana Trade Marks Act, 2004 (Act 664)",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/9180",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/9180",
    notes:
      "Primary Ghana trademark statute covering registration, examination and opposition, rights, renewal, non-use removal, ownership changes, the Trade Mark Registry and legal proceedings; WIPO Lex flags the 2014 amendment separately.",
  }),
  target(RGD_GH, {
    id: "gh-rgd-trademarks-amendment-act-2014",
    family: "LEGAL_TEXTS",
    displayName: "Ghana Trademarks (Amendment) Act, 2014 (Act 876)",
    canonicalUri: "https://www.wipo.int/wipolex/en/legislation/details/17315",
    verificationEvidenceUri: "https://www.wipo.int/wipolex/en/legislation/details/17315",
    notes:
      "Amends Act 664, including ten-year renewal alignment and Ghana's Madrid Protocol international-registration framework.",
  }),
] satisfies readonly SourceCoverageTarget[];

'''
    priority = replace_once(
        priority,
        "const CIPO: Authority = {",
        gh_block + "const CIPO: Authority = {",
        "CIPO authority",
    )
    priority = replace_once(
        priority,
        "  ...RDB_RW_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
        "  ...RDB_RW_SOURCE_COVERAGE_TARGETS,\n  ...RGD_GH_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,",
        "priority aggregate",
    )
    write(priority_path, priority)

catalog_path = "packages/persistence/src/source-coverage-catalog.ts"
catalog = read(catalog_path)
if "RGD_GH_SOURCE_COVERAGE_TARGETS" not in catalog:
    catalog = replace_once(
        catalog,
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "catalog import",
    )
    catalog = replace_once(
        catalog,
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "catalog export",
    )
    write(catalog_path, catalog)

priority_test_path = "packages/persistence/tests/priority-national-source-coverage.test.ts"
priority_test = read(priority_test_path)
if "RGD_GH_SOURCE_COVERAGE_TARGETS" not in priority_test:
    priority_test = replace_once(
        priority_test,
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "  RDB_RW_SOURCE_COVERAGE_TARGETS,\n  RGD_GH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,",
        "priority test import",
    )
    priority_test = replace_once(
        priority_test,
        '  ["RW", RDB_RW_SOURCE_COVERAGE_TARGETS, ["rdb.rw"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
        '  ["RW", RDB_RW_SOURCE_COVERAGE_TARGETS, ["rdb.rw"]],\n  ["GH", RGD_GH_SOURCE_COVERAGE_TARGETS, ["rgd.gov.gh", "wipo.int"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',
        "priority authority set",
    )
    priority_test = priority_test.replace(
        "seventy-six priority national offices",
        "seventy-seven priority national offices",
        1,
    )
    priority_test = priority_test.replace("toHaveLength(619)", "toHaveLength(624)", 1)
    priority_test = priority_test.replace("      619,\n", "      624,\n", 1)
    priority_test = priority_test.replace(").toBe(619);", ").toBe(624);", 1)
    write(priority_test_path, priority_test)

retrieval_path = "packages/persistence/src/retrieval-relevance-audit.ts"
retrieval = read(retrieval_path)
if "gh-rgd-industrial-property-portal-name" not in retrieval:
    probes = r'''  {
    id: "gh-rgd-industrial-property-portal-name",
    targetId: "gh-rgd-industrial-property-portal",
    query: "Ghana Registrar General Department industrial property trademarks mandate",
  },
  {
    id: "gh-rgd-trademark-fees-name",
    targetId: "gh-rgd-trademark-fees",
    query: "Ghana trademark search application examination publication opposition renewal fees",
  },
  {
    id: "gh-rgd-trademark-regulations-name",
    targetId: "gh-rgd-trademark-regulations",
    query: "Ghana Trade Marks Regulations LI 667 application search opposition renewal forms",
  },
  {
    id: "gh-rgd-trademarks-act-2004-name",
    targetId: "gh-rgd-trademarks-act-2004",
    query: "Ghana Trade Marks Act 2004 Act 664 registration examination opposition renewal",
  },
  {
    id: "gh-rgd-trademarks-amendment-act-2014-name",
    targetId: "gh-rgd-trademarks-amendment-act-2014",
    query: "Ghana Trademarks Amendment Act 2014 Act 876 Madrid Protocol ten year renewal",
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
if 'jurisdiction: "GH"' not in retrieval_test:
    retrieval_test = retrieval_test.replace("toHaveLength(575)", "toHaveLength(580)", 2)
    retrieval_test = retrieval_test.replace("      575,\n", "      580,\n", 1)
    gh_assertion = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "GH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
    anchor = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "RW", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
    retrieval_test = replace_once(
        retrieval_test,
        anchor,
        anchor + gh_assertion,
        "retrieval Ghana jurisdiction assertion",
    )
    write(retrieval_test_path, retrieval_test)

print("Ghana RGD trademark source coverage patch applied")
