import type { Conventions, FetchedRepo, Inventory, LLMProvider } from "../types.js";
import { deriveDomainHints } from "./domain-hints.js";
import { generateJsonWithRetry } from "./json.js";
import { deriveProjectCommands, formatManifestExcerptsForExtract } from "./project-commands.js";
import { EXTRACT_PROMPT } from "./prompts.js";

type ConventionsBody = Omit<Conventions, "inventory" | "commands" | "domainHints">;

function parseConventionsBody(data: unknown): ConventionsBody | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const naming = o.naming;
  if (!naming || typeof naming !== "object") return null;
  const n = naming as Record<string, unknown>;
  if (
    typeof n.files !== "string" ||
    typeof n.components !== "string" ||
    typeof n.functions !== "string" ||
    typeof n.variables !== "string"
  ) {
    return null;
  }
  if (typeof o.file_organization !== "string") return null;
  if (typeof o.error_handling !== "string") return null;
  if (typeof o.state_management !== "string") return null;
  if (typeof o.testing_patterns !== "string") return null;
  if (!Array.isArray(o.things_to_avoid)) return null;
  const things_to_avoid = o.things_to_avoid.filter((x): x is string => typeof x === "string");
  const abs = o.common_abstractions;
  if (!Array.isArray(abs)) return null;
  const common_abstractions: Conventions["common_abstractions"] = [];
  for (const item of abs) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (
      typeof a.name === "string" &&
      typeof a.purpose === "string" &&
      typeof a.example_path === "string"
    ) {
      common_abstractions.push({
        name: a.name,
        purpose: a.purpose,
        example_path: a.example_path,
      });
    }
  }
  const ps = o.primary_skill;
  if (!ps || typeof ps !== "object") return null;
  const p = ps as Record<string, unknown>;
  if (typeof p.name !== "string" || typeof p.procedure !== "string") return null;

  return {
    naming: {
      files: n.files,
      components: n.components,
      functions: n.functions,
      variables: n.variables,
    },
    file_organization: o.file_organization,
    error_handling: o.error_handling,
    state_management: o.state_management,
    testing_patterns: o.testing_patterns,
    common_abstractions,
    things_to_avoid,
    primary_skill: { name: p.name, procedure: p.procedure },
  };
}

export async function runExtractPhase(
  repo: FetchedRepo,
  inventory: Inventory,
  sampleContext: string,
  provider: LLMProvider,
  maxTokens: number,
  temperature: number,
): Promise<{ ok: true; conventions: Conventions } | { ok: false; lastText: string }> {
  const invJson = JSON.stringify(inventory, null, 2);
  const manifest = formatManifestExcerptsForExtract(repo.files);
  const conv = await generateJsonWithRetry(provider, {
    system: EXTRACT_PROMPT,
    user: `## Inventory (JSON)\n\n${invJson}\n\n${sampleContext}${manifest}`,
    temperature,
    maxTokens,
  });
  if (!conv.ok) {
    return { ok: false, lastText: conv.lastText };
  }
  const body = parseConventionsBody(conv.data);
  if (!body) {
    return { ok: false, lastText: JSON.stringify(conv.data).slice(0, 500) };
  }
  const commands = deriveProjectCommands(repo.files, inventory);
  const domainHints = deriveDomainHints(repo.files);
  return { ok: true, conventions: { inventory, commands, domainHints, ...body } };
}
