# Contributing

## Requirements

- Node.js 22 or 24
- Corepack or pnpm 11.13.0

## Setup

```bash
corepack enable
corepack prepare pnpm@11.13.0 --activate
pnpm install --frozen-lockfile
```

## Development

```bash
pnpm dev
```

The administration shell is available at `http://localhost:3000`.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

## Workflow

1. Branch from `main` using `feature/`, `fix/`, `docs/` or the task-specified branch name.
2. Keep each branch focused on one reviewed task.
3. Open a Draft PR early.
4. Include validation results and screenshots for UI changes.
5. Verify from a clean checkout with `pnpm install --frozen-lockfile && pnpm check`.
6. Do not merge your own PR unless the project owner explicitly requests it.
