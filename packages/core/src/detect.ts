import type { FetchedRepo } from "./types.js";

const RULES: Array<{ format: string; match: (path: string) => boolean }> = [
  {
    format: "claude-md",
    match: (p) =>
      /(^|\/)claude\.md$/i.test(p) ||
      /(^|\/)\.claude\/claude\.md$/i.test(p) ||
      /(^|\/)\.claude\/claude\.local\.md$/i.test(p),
  },
  {
    format: "cursorrules",
    match: (p) =>
      /(^|\/)\.cursorrules$/i.test(p) || p === ".cursor/rules" || p.startsWith(".cursor/rules/"),
  },
  { format: "agents-md", match: (p) => /(^|\/)agents\.md$/i.test(p) },
  {
    format: "copilot",
    match: (p) => p === ".github/copilot-instructions.md" || p.endsWith("/.github/copilot-instructions.md"),
  },
];

/**
 * Return adapter **format** names for AI tool config files present in the snapshot.
 */
export function detectExistingFormats(repo: FetchedRepo): string[] {
  const paths = new Set<string>();
  for (const p of repo.tree) {
    paths.add(p.replace(/\\/g, "/"));
  }
  for (const p of Object.keys(repo.files)) {
    paths.add(p.replace(/\\/g, "/"));
  }
  const found = new Set<string>();
  for (const path of paths) {
    const norm = path.replace(/^\.\//, "");
    for (const { format, match } of RULES) {
      if (match(norm)) {
        found.add(format);
      }
    }
  }
  return [...found].sort();
}
