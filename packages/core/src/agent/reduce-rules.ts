import type { Conventions, Inventory, LLMProvider } from "../types.js";

export const RULE_REDUCE_SYSTEM = `You are a rule auditor. For each rule in the input list, ask: if this rule were removed, would Claude make a specific, identifiable mistake on THIS codebase? If yes, keep it. If it's generic best practice that applies to every project, remove it.

You receive project context (inventory JSON) and a JSON object with a "rules" array of strings to audit.

Return JSON with this exact shape: { "kept": string[] }
- "kept" must list only rules you are keeping (prefer verbatim text from the input).
- No other top-level keys. No markdown, no explanation outside the JSON.`;

export const RULE_REDUCE_DEBUG_SYSTEM = `You are a rule auditor. For each rule in the input list, ask: if this rule were removed, would Claude make a specific, identifiable mistake on THIS codebase? If yes, keep it. If it's generic best practice that applies to every project, remove it.

You receive project context (inventory JSON) and a JSON object with a "rules" array of strings to audit.

Return JSON: { "kept": string[], "removed": Array<{ "rule": string, "reason": string }> }
- Every input rule must appear exactly once in either "kept" (verbatim) or "removed" (with the same rule text in "rule").
- "reason" is one short sentence per removed rule. No markdown fences.`;

function parseKept(data: unknown): string[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const kept = o.kept;
  if (!Array.isArray(kept)) return null;
  const out: string[] = [];
  for (const x of kept) {
    if (typeof x === "string" && x.trim()) out.push(x);
  }
  return out;
}

function parseDebug(data: unknown): { kept: string[]; removed: Array<{ rule: string; reason: string }> } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const kept = parseKept(data);
  if (!kept) return null;
  const removedRaw = o.removed;
  if (!Array.isArray(removedRaw)) return null;
  const removed: Array<{ rule: string; reason: string }> = [];
  for (const item of removedRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.rule === "string" && typeof r.reason === "string") {
      removed.push({ rule: r.rule, reason: r.reason });
    }
  }
  return { kept, removed };
}

export type RuleReductionResult =
  | { ok: true; kept: string[]; removedDebug?: Array<{ rule: string; reason: string }> }
  | { ok: false; lastText: string };

/**
 * Filter `things_to_avoid`-style rules with a second LLM pass.
 */
export async function runRuleReductionPass(
  inventory: Inventory,
  rules: string[],
  provider: LLMProvider,
  options: {
    maxTokens: number;
    temperature?: number;
    debug: boolean;
    debugLog?: (line: string) => void;
  },
): Promise<RuleReductionResult> {
  if (rules.length === 0) {
    return { ok: true, kept: [] };
  }

  const invJson = JSON.stringify(inventory, null, 2);
  const payload = JSON.stringify({ rules }, null, 2);
  const user = `## Project context (inventory JSON)\n\n${invJson}\n\n## Rules to audit\n\n${payload}`;

  const system = options.debug ? RULE_REDUCE_DEBUG_SYSTEM : RULE_REDUCE_SYSTEM;
  const temp = options.temperature ?? 0.2;
  const maxTok = Math.min(options.maxTokens, 4096);

  let res: { text: string };
  try {
    res = await provider.generate({
      system,
      user,
      maxTokens: maxTok,
      temperature: temp,
      expectJson: true,
    });
  } catch {
    return { ok: false, lastText: "" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text) as unknown;
  } catch {
    return { ok: false, lastText: res.text.slice(0, 500) };
  }

  if (options.debug) {
    const dbg = parseDebug(parsed);
    if (!dbg) return { ok: false, lastText: res.text.slice(0, 500) };
    const log = options.debugLog ?? ((line: string) => console.error(line));
    for (const { rule, reason } of dbg.removed) {
      log(`[rule-reduction] removed: ${rule}\n[rule-reduction] reason: ${reason}\n`);
    }
    return { ok: true, kept: dbg.kept, removedDebug: dbg.removed };
  }

  const kept = parseKept(parsed);
  if (!kept) return { ok: false, lastText: res.text.slice(0, 500) };
  return { ok: true, kept };
}

/**
 * Apply reduction to conventions (mutates copy).
 */
export function applyReducedRules(conv: Conventions, kept: string[]): Conventions {
  return { ...conv, things_to_avoid: kept };
}
