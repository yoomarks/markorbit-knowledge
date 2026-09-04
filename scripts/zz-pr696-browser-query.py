from pathlib import Path
import json

TEST = Path('packages/persistence/src/knowledge-browser-query.test.ts')
text = TEST.read_text()
old = '''function id(prefix: "art" | "std" | "cvr", index: number): string {\n  return `${prefix}_01ARZ3NDEKTSV4RRFFQ${index.toString(32).toUpperCase().padStart(6, "0")}`;\n}\n'''
new = '''const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";\n\nfunction id(prefix: "art" | "std" | "cvr", index: number): string {\n  let value = index + 1;\n  let encoded = "";\n  for (let position = 0; position < 26; position += 1) {\n    encoded = CROCKFORD[value & 31] + encoded;\n    value = Math.floor(value / 32);\n  }\n  return `${prefix}_${encoded}`;\n}\n'''
if text.count(old) != 1:
    raise SystemExit('test id helper match failed')
text = text.replace(old, new, 1)
validation_old = '    validation: { outcome: "PASS", checks: [], warnings: [] },'
validation_new = '''    validation:\n      status === "BLOCKED"\n        ? { outcome: "FAIL", checks: [{ code: "TEST_BLOCKED", status: "FAIL" }], warnings: [] }\n        : { outcome: "PASS", checks: [], warnings: [] },'''
if text.count(validation_old) != 1:
    raise SystemExit('test validation fixture match failed')
TEST.write_text(text.replace(validation_old, validation_new, 1))

package_path = Path('packages/persistence/package.json')
package = json.loads(package_path.read_text())
exports = package['exports']
items = list(exports.items())
rebuilt = {}
inserted = False
for key, value in items:
    rebuilt[key] = value
    if key == './producer-core-reliability-scorecard':
        rebuilt['./knowledge-browser-query'] = './src/knowledge-browser-query.ts'
        inserted = True
if not inserted:
    raise SystemExit('package export anchor missing')
package['exports'] = rebuilt
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')

route = '''import { NextResponse } from "next/server";\nimport {\n  ARTIFACT_KINDS,\n  CONVERSION_STAGING_DOCUMENT_STATUSES,\n  type ArtifactKind,\n  type StagingDocumentDescriptor,\n} from "@markorbit/contracts";\nimport { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";\nimport { queryKnowledgeBrowser } from "@markorbit/persistence/knowledge-browser-query";\nimport { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";\nimport { apiError } from "@/server/api-errors";\nimport { getRegistryDatabase } from "@/server/source-registry";\n\nexport const runtime = "nodejs";\nexport const dynamic = "force-dynamic";\n\nconst DEFAULT_LIMIT = 25;\nconst MAX_LIMIT = 50;\n\nfunction offsetParam(value: string | null): number {\n  if (!value) return 0;\n  const parsed = Number(value);\n  if (!Number.isSafeInteger(parsed) || parsed < 0) {\n    throw new RegistryValidationError("offset must be a non-negative safe integer");\n  }\n  return parsed;\n}\n\nfunction limitParam(value: string | null): number {\n  if (!value) return DEFAULT_LIMIT;\n  const parsed = Number(value);\n  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_LIMIT) {\n    throw new RegistryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);\n  }\n  return parsed;\n}\n\nfunction artifactKind(value: string | null): ArtifactKind | undefined {\n  if (!value) return undefined;\n  if (!ARTIFACT_KINDS.includes(value as ArtifactKind)) {\n    throw new RegistryValidationError(`Unsupported artifact kind ${value}`);\n  }\n  return value as ArtifactKind;\n}\n\nfunction stagingStatus(\n  value: string | null,\n): StagingDocumentDescriptor["status"] | undefined {\n  if (!value) return undefined;\n  if (\n    !CONVERSION_STAGING_DOCUMENT_STATUSES.includes(\n      value as StagingDocumentDescriptor["status"],\n    )\n  ) {\n    throw new RegistryValidationError(`Unsupported staging status ${value}`);\n  }\n  return value as StagingDocumentDescriptor["status"];\n}\n\nexport async function GET(request: Request) {\n  try {\n    const url = new URL(request.url);\n    const assertedWorkspaceId =\n      url.searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;\n    const { workspaceId } = await resolveAdminBrowserApiReadAccess(\n      request,\n      assertedWorkspaceId,\n    );\n\n    return NextResponse.json(\n      queryKnowledgeBrowser(getRegistryDatabase(), {\n        workspaceId,\n        q: url.searchParams.get("q")?.trim() || undefined,\n        sourceId: url.searchParams.get("sourceId")?.trim() || undefined,\n        jurisdiction: url.searchParams.get("jurisdiction")?.trim() || undefined,\n        artifactKind: artifactKind(url.searchParams.get("artifactKind")),\n        status: stagingStatus(url.searchParams.get("status")),\n        offset: offsetParam(url.searchParams.get("offset")),\n        limit: limitParam(url.searchParams.get("limit")),\n      }),\n    );\n  } catch (error) {\n    return apiError(error);\n  }\n}\n'''
Path('apps/admin/src/app/api/knowledge/route.ts').write_text(route)
