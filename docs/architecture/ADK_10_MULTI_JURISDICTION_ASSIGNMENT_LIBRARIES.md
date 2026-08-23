# ADK-10 Multi-Jurisdiction Assignment Libraries

## Objective

Extend the governed ADK Assignment Library beyond the initial US Trademark scope without weakening any ADK-07/08/09 authority boundary.

ADK-10 adds separate Australia and Canada trademark proposition libraries. Each jurisdiction owns its own InstructionSet, immutable KnowledgeAssignment identities and Assignment Library identity. The libraries are indexes of governed research questions; they are not answer stores.

## Frozen scopes

- US: `kal_us_trademark_core@1` / `kis_us_trademark_research_core@1` / 12 workflows.
- AU: `kal_au_trademark_core@1` / `kis_au_trademark_research_core@1` / 10 workflows.
- CA: `kal_ca_trademark_core@1` / `kis_ca_trademark_research_core@1` / 10 workflows.

The AU and CA libraries deliberately use jurisdiction-specific prompts and source priorities. No US Assignment id, InstructionSet id or Library id is reused across jurisdictions.

## Persistence and replay

All three libraries use the existing immutable SQLite registries. Replaying an exact seed is idempotent. Same-identity mutation, revision drift or jurisdiction/domain scope mismatch continues to fail closed through the existing registries.

The bootstrap catalog supports `US`, `AU`, `CA` and `ALL`. `ALL` means sequentially install the exact frozen jurisdiction seeds into one registry; it does not merge the libraries into a cross-jurisdiction object.

## Growth model

ADK-10 seeds only the initial proposition surface. Evidence discovered later may produce `AiAssignmentCandidateV1` proposals. Promotion into a durable Assignment and a later library revision must pass through the governed ADK-09 promotion receipt. No candidate becomes executable merely because its jurisdiction library exists.

## Permanent boundaries

ADK-10 does not:

- store provider answer content in an Assignment Library;
- enqueue ADK-07 jobs;
- call DeepSeek, OpenAI or any other provider;
- compare or rank providers;
- verify legal truth;
- auto-promote Assignment Candidates;
- authorize client filings, protected actions or Brain/Core conclusions.
