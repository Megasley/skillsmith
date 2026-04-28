# Skillsmith documentation

## Architecture

Skillsmith is a **monorepo**:

| Package | Role |
| --------|------|
| **`@skillsmith/core`** (`packages/core`) | Fetch repo snapshots (local + GitHub tarball), LLM providers (Anthropic, OpenAI, Ollama), agent pipeline (inventory → sample → extract), format adapters, cost heuristics, detection of existing AI rule files. |
| **`skillsmith`** (`packages/cli`) | Commander-based CLI: `generate`, `compile`, `init`, `formats`. |
| **`web`** (`packages/web`) | Next.js UI; calls the same core behaviors via API routes. |

The agent pipeline is implemented under `packages/core/src/agent/`:

1. **Inventory** — structured JSON about language, framework, libraries, tests, package manager.
2. **Sample** — prioritized file paths and excerpts within size limits (`packages/core/src/fetchers/`, `agent/sample.ts`).
3. **Extract** — second LLM pass producing conventions JSON (`agent/extract.ts`, `agent/prompts.ts`).
4. **Synthesize** — pure rendering from conventions to each output format (`packages/core/src/adapters/`).

Providers live in `packages/core/src/providers/`; shared types in `packages/core/src/types.ts`.

## Related links

- [Root README](../README.md) — user-facing overview, CLI, FAQ  
- [`agents.json` schema](./agents-schema.md) — manifest format and `compile` targets  
- [Examples](../examples/) — generated outputs on real open-source repos  
- [Contributing](../CONTRIBUTING.md) — development and adapters  
