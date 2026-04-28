import type { Adapter, ClaudeScope, Conventions } from "../types.js";
import { claudeRelativeFilename, skillsmithClaudeHeader } from "./claude-paths.js";

function commonTasksFromProcedure(name: string, procedure: string): string {
  const steps = procedure
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  if (steps.length === 0) {
    return `- ${name}`;
  }
  return steps.map((s) => `- ${s}`).join("\n");
}

function commandsSection(conv: Conventions): string {
  const c = conv.commands;
  const items: [string, string | null][] = [
    ["Install", c.install],
    ["Dev server", c.dev],
    ["Build", c.build],
    ["Test (full suite)", c.test_all],
    ["Test (single path)", c.test_single],
    ["Lint", c.lint],
    ["Lint (auto-fix)", c.lint_fix],
    ["Typecheck", c.typecheck],
    ["Format", c.format],
  ];
  const blocks = items
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== "")
    .map(([label, cmd]) => `### ${label}\n\n\`\`\`bash\n${cmd}\n\`\`\``);
  if (blocks.length === 0) return "";
  return `## Commands\n\n${blocks.join("\n\n")}\n\n`;
}

function patternBlocks(conv: Conventions): string {
  if (conv.common_abstractions.length === 0) {
    return "_No shared patterns extracted._";
  }
  return conv.common_abstractions
    .map((a) => {
      const path = a.example_path.replace(/`/g, "");
      return `### ${a.name}

\`${path}\` — ${a.purpose}

\`\`\`tsx
// Example: import or compose from ${path}
\`\`\``;
    })
    .join("\n\n");
}

export type RenderClaudeMdOptions = {
  /** Default `project`. */
  scope?: ClaudeScope;
};

/**
 * Render CLAUDE.md from structured conventions (pure, no LLM).
 */
export function renderClaudeMd(conv: Conventions, options?: RenderClaudeMdOptions): string {
  const scope = options?.scope ?? "project";
  const inv = conv.inventory;
  const libs = inv.key_libraries.length ? inv.key_libraries.join(", ") : "_See package manifests._";
  const avoid =
    conv.things_to_avoid.length > 0
      ? conv.things_to_avoid.map((t) => `- ${t}`).join("\n")
      : "_None listed._";

  const body = `# Project Overview

This repository is a **${inv.project_type}** written primarily in **${inv.primary_language}**${
    inv.framework ? `, built with **${inv.framework}**` : ""
  }. Use the paths and patterns below as ground truth when editing code—prefer extending existing abstractions over inventing new ones.

## Stack

- **Framework:** ${inv.framework ?? "Not specified"}
- **Package manager:** ${inv.package_manager ?? "Not specified"}
- **Testing:** ${inv.testing_framework ?? "Not specified"}
- **Key libraries:** ${libs}

${commandsSection(conv)}
## Conventions

### Naming

- **Files:** ${conv.naming.files}
- **Components:** ${conv.naming.components}
- **Functions:** ${conv.naming.functions}
- **Variables:** ${conv.naming.variables}

### Layout and architecture

${conv.file_organization}

### Errors, state, and tests

- **Error handling:** ${conv.error_handling}
- **State:** ${conv.state_management}
- **Testing:** ${conv.testing_patterns}

## Key Patterns

${patternBlocks(conv)}

## Things to Avoid

${avoid}

## Common Tasks

Typical workflow: **${conv.primary_skill.name}**

${commonTasksFromProcedure(conv.primary_skill.name, conv.primary_skill.procedure)}
`;

  return `${skillsmithClaudeHeader(scope)}${body}`;
}

export const claudeMdAdapter: Adapter = {
  format: "claude-md",
  filename: claudeRelativeFilename("project"),
  render(conv: Conventions) {
    return Promise.resolve(renderClaudeMd(conv, { scope: "project" }));
  },
};
