from pathlib import Path

p=Path('packages/persistence/src/source-coverage-catalog.ts')
s=p.read_text()
old='  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
assert s.count(old)==2
s=s.replace(old,'  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,')
p.write_text(s)

p=Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
s=p.read_text()
old='  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,'
assert old in s
s=s.replace(old,'  MYIPO_MY_SOURCE_COVERAGE_TARGETS,\n  IPOPHL_PH_SOURCE_COVERAGE_TARGETS,\n  IPOS_SOURCE_COVERAGE_TARGETS,',1)
old='  ["MY", MYIPO_MY_SOURCE_COVERAGE_TARGETS, ["myipo.gov.my"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],'
assert old in s
s=s.replace(old,'  ["MY", MYIPO_MY_SOURCE_COVERAGE_TARGETS, ["myipo.gov.my"]],\n  ["PH", IPOPHL_PH_SOURCE_COVERAGE_TARGETS, ["ipophil.gov.ph"]],\n  ["CA", CIPO_SOURCE_COVERAGE_TARGETS, ["canada.ca"]],',1)
s=s.replace('forty-nine priority national offices','fifty priority national offices',1)
s=s.replace('toHaveLength(382)','toHaveLength(391)',1)
s=s.replace('      382,\n    );','      391,\n    );',1)
s=s.replace('    ).toBe(382);','    ).toBe(391);',1)
p.write_text(s)

p=Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
s=p.read_text()
s=s.replace('expect(targets).toHaveLength(365);','expect(targets).toHaveLength(373);',1)
s=s.replace('expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(365);','expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(373);',1)
s=s.replace('      365,\n    );','      373,\n    );',1)
old='''    expect(\n      listSourceCoverageTargets({ jurisdiction: "MY", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
assert old in s
s=s.replace(old,old+'''    expect(\n      listSourceCoverageTargets({ jurisdiction: "PH", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n''',1)
p.write_text(s)
