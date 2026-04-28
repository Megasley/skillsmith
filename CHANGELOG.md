# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-28

### Added

- **CLI** (`skillsmith` on npm): `generate` (default), `compile`, `init`, `formats` — local paths, GitHub `owner/repo`, or full repository URLs
- **Rule adapters**: `.claude/CLAUDE.md` (with `--scope` project | global | local), `.cursorrules`, `AGENTS.md`, `.github/copilot-instructions.md`
- **Task subagents**: LLM-generated definitions → `.claude/agents/*.md`, root `agents.json`; optional `.cursor/rules/skillsmith-*.mdc` via `--cursor`; skip generation with `--no-subagents` or disk output with `--no-subagent-output`
- **`compile`**: read `agents.json` and emit Cursor (`.mdc`) or Claude Code (`.md`) only — no repo analysis ([schema](./docs/agents-schema.md))
- **Pipeline**: inventory → sample → extract → rule reduction → subagents → synthesize; cost preview; `--no-reduce` and `--debug` for reduction
- **Providers**: Anthropic (default), OpenAI, Ollama — BYOK via env or `~/.skillsmith/config.json`
- **`@skillsmith/core`**: fetchers, agent pipeline, format adapters, subagent compilers
- **Web** (Next.js): same core pipeline; results include subagents, `agents.json`, optional Cursor previews
- **Examples**: reference outputs under `examples/`
- **Docs**: root README, `docs/` (including `agents-schema.md`), contributing and community files

[0.1.0]: https://github.com/Megasley/skillsmith/releases/tag/v0.1.0
