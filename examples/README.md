# Example outputs

Checked-in **Skillsmith outputs** for public repositories. Use them to judge tone and specificity before running the tool yourself.

## Table

| Directory | Source repository | Notes |
| --------- | ----------------- | ----- |
| [`vercel-ai-chatbot/`](./vercel-ai-chatbot/) | [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) | Next.js AI chat demo; includes `agents.json` and `.claude/agents/`. |
| [`shadcn-ui-ui/`](./shadcn-ui-ui/) | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | UI / docs monorepo (Turborepo); includes subagents. |
| [`tiangolo-fastapi/`](./tiangolo-fastapi/) | [tiangolo/fastapi](https://github.com/tiangolo/fastapi) | Python API framework; **rule files only** in this snapshot (no `agents.json` folder layout here). |
| [`rails-rails/`](./rails-rails/) | [rails/rails](https://github.com/rails/rails) | Ruby on Rails; includes subagents. |
| [`honojs-hono/`](./honojs-hono/) | [honojs/hono](https://github.com/honojs/hono) | TypeScript web framework; includes subagents. |

Each directory mirrors paths you would get from a local run (e.g. `.claude/CLAUDE.md`, `.cursorrules`, `AGENTS.md`, `.github/copilot-instructions.md`, and where applicable `agents.json` plus `.claude/agents/*.md`).

## Reproducibility

Outputs depend on the **model**, **provider**, **Skillsmith version**, and **upstream default branch** at run time. Your files will not match byte-for-byte unless you pin those.

Approximate regeneration (from repo root, with your API key):

```bash
# Example: regenerate one sample into a clean folder
mkdir -p /tmp/skillsmith-out && skillsmith vercel/ai-chatbot --yes -o /tmp/skillsmith-out
```

Compare against the matching folder under `examples/` to see drift (new upstream commits will change inventory and LLM output).

## Generation metadata

- These trees are **maintained as reference snapshots** in git, not produced by CI on every push.
- When refreshing an example, note in your PR: **date**, **Skillsmith version** (`skillsmith --version` / package version), **provider**, and **model** if known.

For project-wide conventions and architecture, see the [root README](../README.md).
