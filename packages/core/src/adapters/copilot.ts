import type { Adapter, Conventions } from "../types.js";

/**
 * GitHub Copilot instructions: short, bullet-heavy, critical info first.
 * Only a top-level title — no further markdown headings.
 */
export function renderCopilot(conv: Conventions): string {
  const inv = conv.inventory;
  const bullets: string[] = [];

  bullets.push(
    `- **Stack:** ${inv.primary_language}${inv.framework ? `, ${inv.framework}` : ""} (${inv.project_type}).`,
    `- **Packages to respect:** ${inv.key_libraries.slice(0, 6).join(", ")}${inv.key_libraries.length > 6 ? ", …" : ""}.`,
    `- **Package manager:** ${inv.package_manager ?? "use repo lockfile"}.`,
    `- **Files:** ${conv.naming.files}`,
    `- **Components:** ${conv.naming.components}`,
    `- **Functions / variables:** ${conv.naming.functions}; ${conv.naming.variables}`,
    `- **Layout:** ${conv.file_organization}`,
    `- **Errors:** ${conv.error_handling}`,
    `- **State:** ${conv.state_management}`,
    `- **Tests (${inv.testing_framework ?? "see package.json"}):** ${conv.testing_patterns}`,
  );

  for (const a of conv.common_abstractions) {
    bullets.push(`- **Pattern \`${a.example_path}\` (${a.name}):** ${a.purpose}`);
  }

  for (const t of conv.things_to_avoid) {
    bullets.push(`- **Avoid:** ${t}`);
  }

  bullets.push(`- **Common task (${conv.primary_skill.name}):** ${conv.primary_skill.procedure.replace(/\n+/g, " ")}`);

  const body = bullets.join("\n");
  return `# Copilot instructions for this repository\n\n${body}`;
}

export const copilotAdapter: Adapter = {
  format: "copilot",
  filename: ".github/copilot-instructions.md",
  render(conv: Conventions) {
    return Promise.resolve(renderCopilot(conv));
  },
};
