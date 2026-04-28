# skillsmith CLI

Analyze a local folder or GitHub repository and write AI rules files (CLAUDE.md, `.cursorrules`, AGENTS.md, GitHub Copilot instructions).

```bash
skillsmith                          # current directory (default generate)
skillsmith ./my-project             # local path
skillsmith vercel/next.js           # GitHub shorthand
skillsmith --yes                    # flags-first (same as generate --yes)
skillsmith -k sk-ant-... -p anthropic --yes .
skillsmith init                     # ~/.skillsmith/config.json (mode 0600)
skillsmith formats                  # list format ids and tools
skillsmith generate --help          # all generate options
```

Config priority: **CLI flags → environment → ~/.skillsmith/config.json → defaults.**

- **Local** projects: files are written to the project root by default (override with `-o`).
- **Remote** repos: files default to the **current working directory**.

Requires an API key for Anthropic/OpenAI, or use `-p ollama` for a local model.

See the monorepo root for full documentation.
