from pathlib import Path


# Fix the generator's insertion marker before generation.
generator = Path("scripts/agent-r1-k04-implement.py")
text = generator.read_text()
old = '''first = text.find(class_list_marker)
second = text.find(class_list_marker, first + 1)
if second == -1:
    raise SystemExit("class list method marker not found")
text = text[:second] + class_methods + text[second:]'''
new = '''position = text.find(class_list_marker)
if position == -1:
    raise SystemExit("class list method marker not found")
text = text[:position] + class_methods + text[position:]'''
if old in text:
    generator.write_text(text.replace(old, new, 1))


def repair_after_generation() -> None:
    # Python triple-quoted generator literals intentionally get repaired to escaped TS strings.
    fixtures = {
        "apps/admin/src/server/__tests__/ready-package-core-content-submit.test.ts":
            'const MARKDOWN = "# Frozen content\\n\\nSecond-stage delivery.\\n";',
        "apps/admin/src/server/e2e/core-intake-real-core.e2e.ts":
            'const MARKDOWN = "# Real Core E2E\\n\\nFrozen canonical content.\\n";',
    }
    for filename, replacement in fixtures.items():
        path = Path(filename)
        source = path.read_text()
        start = source.index("const MARKDOWN = ")
        end = source.index(";", start) + 1
        path.write_text(source[:start] + replacement + source[end:])

    # Keep the original intake repository interface backward compatible. The content
    # stage is an additive extension so existing intake mocks do not need new methods.
    path = Path("packages/persistence/src/ready-package-core-intake-submission.ts")
    source = path.read_text()
    start = source.index("export interface ReadyPackageCoreIntakeSubmissionRepository {")
    end_marker = "\n}\n\nfunction submissionId"
    end = source.index(end_marker, start) + 2
    interfaces = '''export interface ReadyPackageCoreIntakeSubmissionRepository {
  prepare(
    input: PrepareReadyPackageCoreIntakeSubmissionInput,
  ): PrepareReadyPackageCoreIntakeSubmissionResult;
  recordTransportResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  recordResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[];
}

export interface ReadyPackageCoreContentDeliveryRepository
  extends ReadyPackageCoreIntakeSubmissionRepository {
  prepareContentDelivery(
    submissionId: string,
    workspaceId: string,
    input: PrepareReadyPackageCoreContentDeliveryInput,
  ): PrepareReadyPackageCoreContentDeliveryResult;
  recordContentTransportResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
  recordContentResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
}'''
    source = source[:start] + interfaces + source[end:]
    source = source.replace(
        "implements ReadyPackageCoreIntakeSubmissionRepository {",
        "implements ReadyPackageCoreContentDeliveryRepository {",
        1,
    )
    path.write_text(source)

    # Use the additive repository interface and a simple optional evidence type.
    path = Path("apps/admin/src/server/ready-package-core-content-submit.ts")
    source = path.read_text()
    module = 'from "@markorbit/persistence/ready-package-core-intake-submissions";'
    module_pos = source.index(module)
    import_start = source.rfind("import type {", 0, module_pos)
    import_end = source.index("\n", module_pos) + 1
    replacement_import = '''import type {
  ReadyPackageCoreContentDeliveryRepository,
  ReadyPackageCoreContentResult,
  ReadyPackageCoreContentResultEvidence,
  ReadyPackageCoreIntakeSubmission,
} from "@markorbit/persistence/ready-package-core-intake-submissions";
'''
    source = source[:import_start] + replacement_import + source[import_end:]
    function_start = source.index("function resultFromEvidence(")
    function_end = source.index("\n}\n\nfunction parseFrozenRequest", function_start) + 2
    simple_function = '''function resultFromEvidence(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
): ReadyPackageCoreContentResult | null {
  if (!evidence) return null;
  return {
    intakeId: evidence.intakeId,
    readyPackageId: evidence.readyPackageId,
    status: evidence.status,
    exportSha256: evidence.exportSha256,
  };
}'''
    source = source[:function_start] + simple_function + source[function_end:]
    source = source.replace(
        "submissions: ReadyPackageCoreIntakeSubmissionRepository,",
        "submissions: ReadyPackageCoreContentDeliveryRepository,",
        1,
    )
    path.write_text(source)


if __name__ == "__main__":
    # The workflow invokes this file once before and once after generation. Before
    # generation only the marker repair is relevant; after generation these paths exist.
    if Path("apps/admin/src/server/ready-package-core-content-submit.ts").exists():
        repair_after_generation()
