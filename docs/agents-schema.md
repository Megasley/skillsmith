# `agents.json` schema (version 1.0)

Skillsmith writes a portable **subagent manifest** at the repository root as `agents.json`. The same file can be **read back** by `skillsmith compile` to emit tool-specific formats without re-running repository analysis.

## Top-level object

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `version` | string | No | Must be `"1.0"` if present. Other values are rejected by the parser. |
| `generatedBy` | string | No | e.g. `"skillsmith"` (informational only). |
| `generatedAt` | string | No | ISO 8601 timestamp (informational only). |
| `agents` | array | **Yes** | List of subagent definitions. May be empty. |

Unknown top-level fields are ignored.

## Agent object (`agents[]`)

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `id` | string | **Yes** | Stable identifier; used to derive file names (see below). |
| `name` | string | **Yes** | Short display name (Claude Code frontmatter `name`). |
| `description` | string | **Yes** | One-line summary of when to use this subagent. |
| `tools` | string[] | No | Tool names for Claude Code (e.g. `Read`, `Grep`). Default: `[]`. |
| `model` | string | No | Model hint for Claude Code frontmatter. Default: `"haiku"`. |
| `systemPrompt` | string | **Yes** | Full instruction body for the subagent. |
| `repoScoped` | boolean | No | Default: `true`. |
| `domainHints` | string[] | No | Tags from dependency/convention analysis. Default: `[]`. |
| `confidence` | string | No | One of `"high"`, `"medium"`, `"low"`. Default: `"medium"`. Stored for round-trips; compile output does not embed it. |

### File naming

- **Claude Code** (`.claude/agents/{stem}.md`): `stem` is derived from `id` by keeping alphanumeric, `.`, `_`, `-`, and replacing other runs with `-`.
- **Cursor** (`.cursor/rules/skillsmith-{stem}.mdc`): same `stem`, prefixed with `skillsmith-`.

## Example

```json
{
  "version": "1.0",
  "generatedBy": "skillsmith",
  "generatedAt": "2026-04-25T12:00:00.000Z",
  "agents": [
    {
      "id": "api-review",
      "name": "API review",
      "description": "Review HTTP handlers and OpenAPI changes.",
      "tools": ["Read", "Grep", "Glob"],
      "model": "sonnet",
      "systemPrompt": "You focus on REST handlers under src/api/…",
      "repoScoped": true,
      "domainHints": ["nodejs"],
      "confidence": "high"
    }
  ]
}
```

## Compile targets

| `--target` | Output |
| ---------- | ------ |
| `claude-code` | `.claude/agents/{stem}.md` per agent |
| `cursor` | `.cursor/rules/skillsmith-{stem}.mdc` per agent (tool preamble stripped from `systemPrompt`) |

Example:

```bash
skillsmith compile --from agents.json --target cursor
```

Optional `-o` / `--output-dir` sets the project root to write under; default is the directory containing the `--from` file.

## Related

- [Skillsmith documentation index](./README.md)
