import type { Adapter, Conventions } from "../types.js";

/**
 * Render .cursorrules as plain imperative text (no markdown headers).
 */
export function renderCursorrules(conv: Conventions): string {
  const inv = conv.inventory;
  const lines: string[] = [];

  lines.push(
    `This is a ${inv.primary_language} ${inv.project_type} repository${inv.framework ? ` using ${inv.framework}` : ""}.`,
    ``,
    `When creating or renaming files, follow: ${conv.naming.files}`,
    `When building React components, follow: ${conv.naming.components}`,
    `When naming functions and hooks, follow: ${conv.naming.functions}`,
    `When naming variables and constants, follow: ${conv.naming.variables}`,
    ``,
    `When organizing modules and directories, follow this layout: ${conv.file_organization}`,
    ``,
    `When handling errors and API failures, follow: ${conv.error_handling}`,
    `When managing client or server state, follow: ${conv.state_management}`,
    `When adding or changing tests, follow: ${conv.testing_patterns}`,
    ``,
    `Prefer these libraries when they already solve the problem: ${inv.key_libraries.join(", ") || "see package.json"}.`,
    inv.package_manager
      ? `Use ${inv.package_manager} for installs and scripts.`
      : `Follow the lockfile and scripts defined in package.json.`,
  );

  for (const a of conv.common_abstractions) {
    lines.push(
      ``,
      `When working near or extending "${a.name}" (${a.example_path}), ${a.purpose}`,
    );
  }

  if (conv.things_to_avoid.length > 0) {
    lines.push(``, `Do not do the following:`);
    for (const t of conv.things_to_avoid) {
      lines.push(`- ${t}`);
    }
  }

  lines.push(
    ``,
    `For the recurring task "${conv.primary_skill.name}", follow this procedure exactly:`,
    conv.primary_skill.procedure,
  );

  return lines.join("\n");
}

export const cursorrulesAdapter: Adapter = {
  format: "cursorrules",
  filename: ".cursorrules",
  render(conv: Conventions) {
    return Promise.resolve(renderCursorrules(conv));
  },
};
