from pathlib import Path

priority = Path('packages/persistence/src/priority-national-source-coverage.ts')
text = priority.read_text()
old = '  ...INAPI_CL_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
new = '  ...INAPI_CL_SOURCE_COVERAGE_TARGETS,\n  ...SIC_CO_SOURCE_COVERAGE_TARGETS,\n  ...CIPO_SOURCE_COVERAGE_TARGETS,\n'
if old not in text:
    raise SystemExit('priority aggregate anchor not found')
priority.write_text(text.replace(old, new, 1))

catalog = Path('packages/persistence/src/source-coverage-catalog.ts')
text = catalog.read_text()
anchor = '  INAPI_CL_SOURCE_COVERAGE_TARGETS,\n'
if text.count(anchor) < 2:
    raise SystemExit('catalog INAPI CL anchors missing')
text = text.replace(anchor, anchor + '  SIC_CO_SOURCE_COVERAGE_TARGETS,\n', 2)
catalog.write_text(text)

pt = Path('packages/persistence/tests/priority-national-source-coverage.test.ts')
text = pt.read_text()
imp = '  INAPI_CL_SOURCE_COVERAGE_TARGETS,\n'
if imp not in text:
    raise SystemExit('priority test import anchor missing')
text = text.replace(imp, imp + '  SIC_CO_SOURCE_COVERAGE_TARGETS,\n', 1)
auth = '  ["CL", INAPI_CL_SOURCE_COVERAGE_TARGETS, ["inapi.cl"]],\n'
if auth not in text:
    raise SystemExit('priority test authority anchor missing')
text = text.replace(auth, auth + '  ["CO", SIC_CO_SOURCE_COVERAGE_TARGETS, ["sic.gov.co"]],\n', 1)
text = text.replace(
    'ships explicit, official, unique coverage for fifty-six priority national offices',
    'ships explicit, official, unique coverage for fifty-seven priority national offices',
    1,
)
text = text.replace('toHaveLength(442)', 'toHaveLength(451)', 1)
text = text.replace('      442,\n', '      451,\n', 1)
text = text.replace('    ).toBe(442);\n', '    ).toBe(451);\n', 1)
pt.write_text(text)

rt = Path('packages/persistence/tests/retrieval-relevance-audit.test.ts')
text = rt.read_text()
text = text.replace('expect(targets).toHaveLength(418);', 'expect(targets).toHaveLength(426);', 1)
text = text.replace(
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(418);',
    'expect(FOUNDATIONAL_RETRIEVAL_RELEVANCE_PROBES).toHaveLength(426);',
    1,
)
text = text.replace('      418,\n', '      426,\n', 1)
cl_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CL", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
if cl_check not in text:
    raise SystemExit('retrieval CL jurisdiction anchor missing')
co_check = '''    expect(\n      listSourceCoverageTargets({ jurisdiction: "CO", coverageTier: "FOUNDATIONAL" }).every(\n        (target) => targetIds.has(target.id),\n      ),\n    ).toBe(true);\n'''
text = text.replace(cl_check, cl_check + co_check, 1)
rt.write_text(text)
