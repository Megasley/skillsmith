import type { Conventions, LLMProvider, SubagentDefinition, TaskPattern } from "../types.js";
import { formatDomainHintPromptSection } from "./domain-hints.js";
import { generateJsonWithRetry } from "./json.js";

const ALLOWED_TOOLS = new Set([
  "Read",
  "Grep",
  "Glob",
  "Bash",
  "Edit",
  "Write",
  "Task",
]);

export const SUBAGENT_GENERATION_SYSTEM = `You output a single JSON object for a Claude Code–style subagent. No markdown, no code fences, no commentary.

The subagent must be opinionated and specific to THIS repository: use the real stack, naming rules, folder layout, test commands, and abstractions from the conventions JSON. Reference concrete paths and patterns when helpful.

The user message includes **domain hints** detected from dependency manifests and **domain-specific expectations** (security and correctness checks). When the subagent’s role intersects those domains (e.g. code review + payments), weave those expectations into "systemPrompt" explicitly.

Choose tools from this set only: Read, Grep, Glob, Bash, Edit, Write, Task. Prefer the minimal set that fits the role (e.g. review-focused → Read, Grep, Glob; test writer → Read, Grep, Glob, Bash).

Choose model: "haiku" for narrow, mechanical tasks; "sonnet" for most engineering work; "opus" only when the task truly needs deep multi-file reasoning.

Required JSON shape:
{
  "id": string,
  "name": string,
  "description": string,
  "tools": string[],
  "model": "sonnet" | "opus" | "haiku",
  "systemPrompt": string,
  "repoScoped": boolean
}

- "systemPrompt" is the full instruction body the subagent follows (markdown-friendly plain text is OK). It should embed repo-specific guardrails, cite real conventions, and reflect applicable domain expectations from the user message.
- "description" is one line: when this subagent should be invoked.
- "repoScoped" is usually true for these definitions.`;

function normalizeTools(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const s = t.trim();
    if (ALLOWED_TOOLS.has(s)) out.push(s);
  }
  return [...new Set(out)];
}

function parseSubagentBody(
  data: unknown,
  pattern: TaskPattern,
): Omit<SubagentDefinition, "confidence" | "domainHints"> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const systemPrompt = typeof o.systemPrompt === "string" ? o.systemPrompt.trim() : "";
  const model = o.model;
  if (!name || !description || !systemPrompt) return null;
  if (model !== "sonnet" && model !== "opus" && model !== "haiku") return null;
  let tools = normalizeTools(o.tools);
  if (tools.length === 0) {
    tools = ["Read", "Grep", "Glob"];
  }
  const repoScoped = typeof o.repoScoped === "boolean" ? o.repoScoped : true;
  return {
    id: pattern.id,
    name,
    description,
    tools,
    model,
    systemPrompt,
    repoScoped,
  };
}

async function generateOneSubagent(
  pattern: TaskPattern,
  conventions: Conventions,
  provider: LLMProvider,
  maxTokens: number,
  temperature: number,
): Promise<SubagentDefinition | null> {
  const convJson = JSON.stringify(conventions, null, 2);
  const patternJson = JSON.stringify(pattern, null, 2);
  const domainHintsJson = JSON.stringify(conventions.domainHints ?? [], null, 2);
  const domainSection = formatDomainHintPromptSection(conventions.domainHints ?? []);
  const user = `## Task pattern (the subagent "id" MUST be exactly: "${pattern.id}")
${patternJson}

## Domain hints detected for this repository (from package.json, Cargo.toml, pyproject.toml, requirements.txt)
${domainHintsJson}

## Domain-specific expectations (reflect in systemPrompt when this subagent’s role touches these areas)
${domainSection}

## Repository conventions (use real paths, commands, and terminology from here)
${convJson}

Return one JSON object with keys: id, name, description, tools, model, systemPrompt, repoScoped.
The "id" field must be exactly: "${pattern.id}"`;

  const res = await generateJsonWithRetry(provider, {
    system: SUBAGENT_GENERATION_SYSTEM,
    user,
    maxTokens: Math.min(Math.max(1024, maxTokens), 8192),
    temperature,
  });
  if (!res.ok) {
    return null;
  }
  const body = parseSubagentBody(res.data, pattern);
  if (!body) {
    return null;
  }
  return {
    ...body,
    confidence: pattern.confidence,
    domainHints: [...(conventions.domainHints ?? [])],
  };
}

/**
 * For each task pattern with confidence ≥ medium, run one LLM call to produce a {@link SubagentDefinition}.
 * Failures for individual patterns are skipped (partial results).
 */
export async function generateSubagents(
  patterns: TaskPattern[],
  conventions: Conventions,
  provider: LLMProvider,
  options: { maxTokens: number; temperature: number },
): Promise<SubagentDefinition[]> {
  const eligible = patterns.filter((p) => p.confidence === "high" || p.confidence === "medium");
  const out: SubagentDefinition[] = [];
  for (const pattern of eligible) {
    const def = await generateOneSubagent(pattern, conventions, provider, options.maxTokens, options.temperature);
    if (def) {
      out.push(def);
    }
  }
  return out;
}
