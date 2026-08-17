from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:140]}")
    file.write_text(text.replace(old, new, 1))


catalog = "packages/persistence/src/source-coverage-catalog.ts"
replace_once(
    catalog,
    '} from "./priority-national-source-coverage";\nimport { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";',
    '} from "./priority-national-source-coverage";\nimport {\n  OAPI_CI_SOURCE_COVERAGE_TARGETS,\n  OAPI_CM_SOURCE_COVERAGE_TARGETS,\n  OAPI_SN_SOURCE_COVERAGE_TARGETS,\n  PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS,\n} from "./priority-regional-source-coverage";\nimport { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";',
)
replace_once(
    catalog,
    "  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,\n  UKIPO_SOURCE_COVERAGE_TARGETS,",
    "  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,\n  OAPI_CI_SOURCE_COVERAGE_TARGETS,\n  OAPI_CM_SOURCE_COVERAGE_TARGETS,\n  OAPI_SN_SOURCE_COVERAGE_TARGETS,\n  PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS,\n  UKIPO_SOURCE_COVERAGE_TARGETS,",
)
replace_once(
    catalog,
    "  ...PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,\n] satisfies readonly SourceCoverageTarget[];",
    "  ...PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,\n  ...PRIORITY_REGIONAL_SOURCE_COVERAGE_TARGETS,\n] satisfies readonly SourceCoverageTarget[];",
)

jurisdictions = "packages/persistence/src/priority-trademark-jurisdictions.ts"
text = Path(jurisdictions).read_text()
for code in ["CI", "CM", "SN"]:
    token = f'["{code}",'
    pos = text.find(token)
    if pos < 0:
        raise SystemExit(f"jurisdiction {code} not found")
    line_end = text.find("\n", pos)
    line = text[pos:line_end]
    if '"TARGET"' not in line or '"REGIONAL"' not in line:
        raise SystemExit(f"jurisdiction {code} is not a regional TARGET: {line}")
    text = text[:pos] + line.replace('"TARGET"', '"CURATED"', 1) + text[line_end:]
Path(jurisdictions).write_text(text)

jurisdiction_test = "packages/persistence/tests/priority-trademark-jurisdictions.test.ts"
replace_once(jurisdiction_test, "expect(curated).toHaveLength(117);", "expect(curated).toHaveLength(120);")
replace_once(jurisdiction_test, "expect(target).toHaveLength(3);", "expect(target).toHaveLength(0);")

relevance = "packages/persistence/src/retrieval-relevance-audit.ts"
text = Path(relevance).read_text()
marker = "] satisfies readonly RetrievalRelevanceProbe[];"
if marker not in text:
    raise SystemExit("retrieval probe marker not found")

blueprints = [
    ("portal", "OAPI regional intellectual property office 17 member states"),
    ("trademark-filing", "OAPI trademark filing electronic application classes payment"),
    ("trademark-search", "OAPI trademark prior art identical similarity search"),
    ("trademark-fees", "OAPI product service trademark fee regulations taxes"),
    ("bangui-agreement", "OAPI Bangui Agreement Annex III product service trademarks"),
    ("implementing-regulation", "OAPI implementing regulation Bangui Agreement 14 December 2015"),
]
probe_parts = []
for jurisdiction in ["ci", "cm", "sn"]:
    for key, query in blueprints:
        target_id = f"{jurisdiction}-oapi-{key}"
        probe_parts.append(
            "  {\n"
            f'    id: "{target_id}-name",\n'
            f'    targetId: "{target_id}",\n'
            f'    query: "{query}",\n'
            "  },\n"
        )
probe_block = "".join(probe_parts)
Path(relevance).write_text(text.replace(marker, probe_block + marker, 1))

relevance_test = "packages/persistence/tests/retrieval-relevance-audit.test.ts"
p = Path(relevance_test)
text = p.read_text()
if text.count("815") != 3:
    raise SystemExit(f"expected three retrieval count markers, found {text.count('815')}")
p.write_text(text.replace("815", "833"))
