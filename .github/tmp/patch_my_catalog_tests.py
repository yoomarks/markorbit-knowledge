from pathlib import Path

p=Path('packages/persistence/src/source-coverage-catalog.ts')
s=p.read_text()
old='  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
assert s.count(old)==2
s=s.replace(old,'  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,')
p.write_text(s)

p=Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
s=p.read_text()
old='  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
assert old in s
s=s.replace(old,'  DOI_NP_SOURCE_COVERAGE_TARGETS,\n  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',1)
old='  ["NP", DOI_NP_SOURCE_COVERAGE_TARGETS, ["doind.gov.np"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
assert old in s
s=s.replace(old,'  ["NP", DOI_NP_SOURCE_COVERAGE_TARGETS, ["doind.gov.np"]],\n  ["MY", MYIPO_MY_SOURCE_COVERAGE_TARGETS, ["myipo.gov.my"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',1)
s=s.replace('forty-eight priority national offices','forty-nine priority national offices',1)
s=s.replace('toHaveLength(373)','toHaveLength(382)',1)
s=s.replace('      373,\n    );','      382,\n    );',1)
s=s.replace('    ).toBe(373);','    ).toBe(382);',1)
p.write_text(s)

p=Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
s=p.read_text()
s=s.replace('expect(targets).toHaveLength(357);','expect(targets).toHaveLength(365);',1)
s=s.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(357);','expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(365);',1)
s=s.replace('      357,\n    );','      365,\n    );',1)
old='''    expect(\n      listSourceCoverageTargets({ jurisdiction: "NP", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
assert old in s
s=s.replace(old,old+'''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MY", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',1)
p.write_text(s)
