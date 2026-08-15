from pathlib import Path

path = Path("packages/persistence/src/source-coverage-catalog.ts")
text = path.read_text()

old_import = 'import { EUIPO_SOURCE_COVERAGE_TARGETS } from "./euipo-source-coverage";\nimport { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";'
new_import = '''import { EUIPO_SOURCE_COVERAGE_TARGETS } from "./euipo-source-coverage";
import {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
} from "./priority-national-source-coverage";
import { WIPO_SOURCE_COVERAGE_TARGETS } from "./wipo-source-coverage";'''
if text.count(old_import) != 1:
    raise SystemExit("coverage import anchor mismatch")
text = text.replace(old_import, new_import, 1)

old_export = 'export { EUIPO_SOURCE_COVERAGE_TARGETS, WIPO_SOURCE_COVERAGE_TARGETS };\nexport const SOURCE_COVERAGE_TARGETS = [\n  ...US_SOURCE_COVERAGE_TARGETS,\n  ...WIPO_SOURCE_COVERAGE_TARGETS,\n  ...EUIPO_SOURCE_COVERAGE_TARGETS,\n] satisfies readonly SourceCoverageTarget[];'
new_export = '''export {
  CIPO_SOURCE_COVERAGE_TARGETS,
  CNIPA_SOURCE_COVERAGE_TARGETS,
  EUIPO_SOURCE_COVERAGE_TARGETS,
  IP_AUSTRALIA_SOURCE_COVERAGE_TARGETS,
  JPO_SOURCE_COVERAGE_TARGETS,
  KOREA_SOURCE_COVERAGE_TARGETS,
  PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
  UKIPO_SOURCE_COVERAGE_TARGETS,
  WIPO_SOURCE_COVERAGE_TARGETS,
};
export const SOURCE_COVERAGE_TARGETS = [
  ...US_SOURCE_COVERAGE_TARGETS,
  ...WIPO_SOURCE_COVERAGE_TARGETS,
  ...EUIPO_SOURCE_COVERAGE_TARGETS,
  ...PRIORITY_NATIONAL_SOURCE_COVERAGE_TARGETS,
] satisfies readonly SourceCoverageTarget[];'''
if text.count(old_export) != 1:
    raise SystemExit("coverage export anchor mismatch")
text = text.replace(old_export, new_export, 1)

path.write_text(text)
