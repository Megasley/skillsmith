export const ALL_FORMAT_IDS = ["claude-md", "cursorrules", "agents-md", "copilot"] as const;

export type FormatId = (typeof ALL_FORMAT_IDS)[number];

export const FORMAT_META: Record<
  FormatId,
  { label: string; tool: string; example: string }
> = {
  "claude-md": {
    label: "CLAUDE.md (Claude Code)",
    tool: "Claude Code / Anthropic",
    example: ".claude/CLAUDE.md",
  },
  cursorrules: {
    label: ".cursorrules",
    tool: "Cursor",
    example: ".cursorrules",
  },
  "agents-md": {
    label: "AGENTS.md",
    tool: "Generic agents / IDE",
    example: "AGENTS.md",
  },
  copilot: {
    label: "Copilot instructions",
    tool: "GitHub Copilot",
    example: ".github/copilot-instructions.md",
  },
};

export function mapDetectedToFormats(detected: string[]): FormatId[] {
  const set = new Set<FormatId>();
  for (const d of detected) {
    if (d === "claude-md") set.add("claude-md");
    if (d === "cursorrules" || d === "cursor-rules-dir") set.add("cursorrules");
    if (d === "agents-md") set.add("agents-md");
    if (d === "copilot") set.add("copilot");
  }
  return [...set];
}

export function parseFormatsCsv(csv: string | undefined): FormatId[] | null {
  if (!csv?.trim()) return null;
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<string>(ALL_FORMAT_IDS);
  const out = parts.filter((p) => allowed.has(p)) as FormatId[];
  return out.length > 0 ? out : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
