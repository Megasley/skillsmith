import type { SubagentDefinition } from "../types.js";

const TOOL_WORDS = /\b(Read|Grep|Glob|Bash|Edit|Write|Task)\b/gi;

/**
 * Remove leading lines that mainly enumerate or instruct about tools (Cursor has no tool API).
 */
export function stripToolReferencesPreamble(systemPrompt: string): string {
  const lines = systemPrompt.split("\n");
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (t === "") {
      i++;
      continue;
    }
    const lower = t.toLowerCase();
    const toolMatches = (t.match(TOOL_WORDS) ?? []).length;
    const toolish =
      /^tools?:/i.test(t) ||
      /\b(you can|you may|you should|use the (following )?tools?)\b/i.test(lower) ||
      /\bavailable tools\b/i.test(lower) ||
      (toolMatches >= 2 && /\b(and|or|,)\b/i.test(t));
    if (toolish) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n").replace(/^\n+/, "").trim();
}

function yamlEscape(s: string): string {
  if (/[,:#"'[\]{}]|\n|^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** Claude Code: `.claude/agents/{id}.md` with YAML frontmatter. */
export function compileClaudeCodeSubagent(def: SubagentDefinition): string {
  const tools = def.tools.join(", ");
  const fm = [
    "---",
    `name: ${yamlEscape(def.name)}`,
    `description: ${yamlEscape(def.description)}`,
    `tools: ${yamlEscape(tools)}`,
    `model: ${def.model}`,
    "---",
    "",
    def.systemPrompt.trim(),
    "",
  ].join("\n");
  return fm;
}

/** Cursor: `.cursor/rules/*.mdc` — no tools in frontmatter; strip tool preamble from body. */
export function compileCursorSubagent(def: SubagentDefinition): string {
  const body = stripToolReferencesPreamble(def.systemPrompt);
  const fm = [
    "---",
    `description: ${yamlEscape(def.description)}`,
    "globs: []",
    "alwaysApply: false",
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
  return fm;
}

export type AgentsJsonManifest = {
  version: "1.0";
  generatedBy: "skillsmith";
  generatedAt: string;
  agents: Array<{
    id: string;
    name: string;
    description: string;
    tools: string[];
    model: string;
    systemPrompt: string;
    repoScoped: boolean;
    domainHints: string[];
  }>;
};

/** Portable `agents.json` manifest. */
export function buildAgentsJsonManifest(
  defs: SubagentDefinition[],
  generatedAt: Date = new Date(),
): AgentsJsonManifest {
  return {
    version: "1.0",
    generatedBy: "skillsmith",
    generatedAt: generatedAt.toISOString(),
    agents: defs.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      tools: [...d.tools],
      model: d.model,
      systemPrompt: d.systemPrompt,
      repoScoped: d.repoScoped,
      domainHints: [...d.domainHints],
    })),
  };
}

export function compileAgentsJson(defs: SubagentDefinition[], generatedAt?: Date): string {
  return `${JSON.stringify(buildAgentsJsonManifest(defs, generatedAt), null, 2)}\n`;
}

/** Safe filename stem for agent id. */
export function subagentFileStem(id: string): string {
  const s = id.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "agent";
}
