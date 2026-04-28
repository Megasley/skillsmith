# skillsmith CLI

Analyze a local folder or GitHub repository and write:

- **Rule adapters**: `.claude/CLAUDE.md`, `.cursorrules`, `AGENTS.md`, GitHub Copilot instructions (`-f` / `--formats`)
- **Subagents** (default): `agents.json`, `.claude/agents/*.md`, and optionally `.cursor/rules/skillsmith-*.mdc` with **`--cursor`**
- **`compile`**: rebuild Cursor or Claude Code files from an existing **`agents.json`** without the LLM (`skillsmith compile --help`)

```bash
skillsmith                          # current directory (default: generate)
skillsmith ./my-project             # local path
skillsmith vercel/next.js         # GitHub shorthand
skillsmith --yes                  # flags-first (same as generate --yes)
skillsmith . --yes --cursor       # include Cursor .mdc rules for subagents
skillsmith -k sk-ant-... -p anthropic --yes .
skillsmith compile --from agents.json --target claude-code
skillsmith init                   # ~/.skillsmith/config.json (mode 0600)
skillsmith formats                # list adapter ids for -f
skillsmith --help                 # all commands + examples
skillsmith generate --help        # generate-only options
```

Config priority: **CLI flags → environment → ~/.skillsmith/config.json → defaults.**

- **Local** projects: files are written to the project root by default (override with `-o`).
- **Remote** repos: files default to the **current working directory**.

Requires an API key for Anthropic/OpenAI, or use `-p ollama` for a local model. The **`compile`** command needs **no** API key.

See the monorepo **[README.md](../../README.md)** and **[docs/agents-schema.md](../../docs/agents-schema.md)** for full documentation.
