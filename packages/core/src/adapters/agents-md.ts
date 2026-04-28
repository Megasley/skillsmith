import type { Adapter, Conventions } from "../types.js";

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

/**
 * AGENTS.md — cross-tool agent instructions (see https://agents.md).
 * Sections: Overview, Setup, Conventions, Testing, Pull Request Guidelines.
 */
export function renderAgentsMd(conv: Conventions): string {
  const inv = conv.inventory;
  const libs = inv.key_libraries.join(", ");
  const abstractions =
    conv.common_abstractions.length > 0
      ? conv.common_abstractions
          .map(
            (a) =>
              `- **${a.name}** (\`${a.example_path}\`): ${a.purpose}`,
          )
          .join("\n")
      : "- _No shared abstractions listed._";

  const avoid =
    conv.things_to_avoid.length > 0
      ? conv.things_to_avoid.map((t) => `- ${t}`).join("\n")
      : "- _None._";

  return `# AGENTS.md

## Overview

- **Language:** ${inv.primary_language}
- **Project type:** ${inv.project_type}
- **Framework:** ${inv.framework ?? "See repository docs"}
- **Primary dependencies:** ${libs || "See package.json"}

This file is for autonomous coding agents. Prefer the conventions and paths below over generic stack advice.

## Setup

Use the commands below when they are present; they are derived from project manifests in the repo snapshot.

${commandsSection(conv)}${
    !conv.commands.install && !conv.commands.dev
      ? `- Install and run workflows using the lockfile and scripts at the repository root (see \`package.json\`, \`pyproject.toml\`, \`Cargo.toml\`, or \`Makefile\`).`
      : ""
  }

## Conventions

### Naming

- **Files:** ${conv.naming.files}
- **Components:** ${conv.naming.components}
- **Functions:** ${conv.naming.functions}
- **Variables:** ${conv.naming.variables}

### Structure and behavior

${conv.file_organization}

**Error handling:** ${conv.error_handling}

**State:** ${conv.state_management}

### Shared building blocks

${abstractions}

**Things agents must not do:**

${avoid}

## Testing

- **Runner / stack:** ${inv.testing_framework ?? "See package.json"}

${conv.testing_patterns}

Run the full test suite before proposing a merge; fix failures you introduce.

## Pull Request Guidelines

- Keep changes scoped; follow the file layout and naming rules above.
- Reuse abstractions listed under **Shared building blocks** instead of duplicating logic.
- Address every **Things agents must not do** item—do not introduce new violations.
- For the common workflow **${conv.primary_skill.name}**, follow:

${conv.primary_skill.procedure}
`;

}

export const agentsMdAdapter: Adapter = {
  format: "agents-md",
  filename: "AGENTS.md",
  render(conv: Conventions) {
    return Promise.resolve(renderAgentsMd(conv));
  },
};
