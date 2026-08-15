import type { SourceDefinition } from "@markorbit/contracts";
import type { SourceRepository } from "@markorbit/persistence";

const SOURCE_PAGE_SIZE = 100;

export function listAllWorkspaceSources(
  repository: Pick<SourceRepository, "list">,
  workspaceId: string,
): SourceDefinition[] {
  const sources: SourceDefinition[] = [];
  let offset = 0;

  while (true) {
    const page = repository.list({ workspaceId, limit: SOURCE_PAGE_SIZE, offset });
    sources.push(...page.items);
    offset += page.items.length;

    if (page.items.length === 0 || offset >= page.total) return sources;
  }
}
