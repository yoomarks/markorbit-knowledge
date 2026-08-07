# ADR-0001: Repository and runtime baseline

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

MarkOrbit Knowledge requires a visual administration surface and shared contracts, while future acquisition workers may use different runtimes. The first task must establish a reliable foundation without prematurely locking persistence or crawler implementation.

## Decision

- Use a pnpm workspace monorepo.
- Support Node.js 22 and 24; use Node 24 as the primary CI/runtime target.
- Pin pnpm 11.13.0 in `packageManager` and the lockfile.
- Use Next.js 16.2.10 App Router, React 19.2.7, TypeScript 5.9.3 and Tailwind CSS 4.3.2.
- Use strict TypeScript, ESLint flat config, Prettier and Vitest.
- Keep preview content fixture-only and explicitly labeled.
- Do not add a database, ORM, Crawl4AI, worker runtime or Vault filesystem access yet.

## Consequences

The repository can validate a complete visual shell on clean checkout while keeping Schema v1, persistence, acquisition execution and Obsidian synchronization available for dedicated decisions. The dynamic module shell avoids fake CRUD and provides stable navigation for future incremental delivery.
