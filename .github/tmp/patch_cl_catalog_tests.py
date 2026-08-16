from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
text = text.replace('expectedArtifactKinds: ["HTML", "PDF", "ZIP"]', 'expectedArtifactKinds: ["HTML", "PDF"]', 1)
old = '  ...CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n  ...INAPI_CL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog CIPC ZA anchors missing')
text = text.replace(anchor, anchor + '  INAPI_CL_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  CIPC_ZA_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  INAPI_CL_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["ZA", CIPC_ZA_SOURCE_COVERAGE_TARGETS, ["cipc.co.za"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["CL", INAPI_CL_SOURCE_COVERAGE_TARGETS, ["inapi.cl"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-five priority national offices',
    'ships explicit, official, unique coverage for fifty-six priority national offices',
    1,
)
text = text.replace('toHaveLength(433)', 'toHaveLength(442)', 1)
text = text.replace('      433,\n', '      442,\n', 1)
text = text.replace('    ).toBe(433);\n', '    ).toBe(442);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(410);', 'expect(targets).toHaveLength(418);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(410);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(418);',
    1,
)
text = text.replace('      410,\n', '      418,\n', 1)
za_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "ZA", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if za_check not in text:
    raise SystemExit('retrieval ZA jurisdiction anchor missing')
cl_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(za_check, za_check + cl_check, 1)
rt.write_text(text)
