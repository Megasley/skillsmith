# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-28

### Added

- **CLI** (`skillsmith`): `generate` (default), `init`, `formats`; local directories and GitHub `owner/repo` or full URLs
- **Outputs**: `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, `.github/copilot-instructions.md`
- **LLM providers**: Anthropic (default), OpenAI, Ollama (local); BYOK via env or `~/.skillsmith/config.json`
- **Pipeline**: inventory → sample → extract → synthesize, with cost preview and optional auto-detection of existing AI rule files
- **`@skillsmith/core`**: shared library for fetchers, agents, adapters, and providers
- **Web app** (Vercel): UI equivalent of the core pipeline
- **Examples**: reference outputs for five open-source repositories under `examples/`
- **Documentation**: root README, `docs/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub issue/PR templates

[1.0.0]: https://github.com/Megasley/skillsmith/releases/tag/v1.0.0
