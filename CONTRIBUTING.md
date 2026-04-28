# Contributing to Skillsmith

Thanks for helping. Keep changes focused, match existing style, and open an issue before large refactors.

## Project structure

```
skillsmith/
├── packages/
│   ├── core/          # @skillsmith/core — pipeline, providers, adapters, fetchers
│   ├── cli/           # skillsmith npm package (bin)
│   └── web/           # Next.js app (Vercel)
├── examples/          # Example generated outputs (reference only)
├── docs/              # Architecture / doc index
└── .github/           # Issue & PR templates
```

- **Core** has no UI; it must stay usable from CLI and server.
- **CLI** depends on `workspace:*` core — publish flow should build core first.

## Development setup

Requirements: **Node 18+**, **pnpm**.

```bash
pnpm install
pnpm --filter @skillsmith/core build
pnpm --filter skillsmith build
```

Run the CLI from the repo root (after build):

```bash
node packages/cli/dist/cli.js --help
```

Web app:

```bash
pnpm --filter web dev
```

## Tests

```bash
pnpm --filter @skillsmith/core test
```

Core uses **Vitest**. Adapter tests live under `packages/core/src/__tests__/adapters/`; provider tests under `packages/core/src/providers/*.test.ts`.

When you change rendering or prompts, run tests and, if needed, refresh snapshots or fixtures intentionally.

## Adding a new format adapter

1. **Implement** `Adapter` in `packages/core/src/adapters/your-format.ts`:
   - `format`: stable ID (e.g. `windsurf-rules`)
   - `filename`: output path relative to repo root
   - `render(conv, provider?)`: async string output from `Conventions`
2. **Register** it in `packages/core/src/adapters/registry.ts` (`adapters` object + exports if you add a named export).
3. **CLI** — add the ID to `ALL_FORMAT_IDS` in `packages/cli/src/util.ts` and extend `FORMAT_META` with label / tool / example for `formats` / `init` UX.
4. **Web** — if the UI hardcodes allowed formats, extend the same list there.
5. **Tests** — add `src/__tests__/adapters/your-format.test.ts` with a minimal `Conventions` fixture and snapshot or string assertions.

Keep adapters **deterministic** (no LLM calls inside `render` unless you have a strong reason). The LLM work happens in the extract phase.

## Code style

- **TypeScript**: strict; prefer explicit types on public APIs.
- **Imports**: use `.js` extensions in TS source where the repo already does (NodeNext / ESM).
- **Formatting**: follow surrounding files; avoid drive‑by renames or unrelated formatting.
- **Dependencies**: add new runtime deps to the smallest package that needs them (`core` vs `cli` vs `web`).

## Pull requests

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md). For user-visible behavior, note how you tested (CLI command, provider, sample repo).

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
