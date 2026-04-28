import type { FetchedRepo, Inventory, LLMProvider } from "../types.js";
import { generateJsonWithRetry } from "./json.js";
import { INVENTORY_PROMPT } from "./prompts.js";

function listManifestFiles(files: Record<string, string>): string[] {
  const keys = Object.keys(files);
  const out: string[] = [];
  const want = new Set([
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "requirements.txt",
    "README.md",
    "readme.md",
    "tsconfig.json",
  ]);
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (want.has(lower)) {
      out.push(k);
    }
  }
  for (const k of keys) {
    if (/^next\.config\./i.test(k.split("/").pop() ?? "")) {
      if (!out.includes(k)) out.push(k);
    }
  }
  return out;
}

export function buildInventoryContext(repo: FetchedRepo, manifestKeys: string[]): string {
  const tree = [...repo.tree].sort((a, b) => a.localeCompare(b, "en"));
  const parts: string[] = [`# File tree (paths only)\n`, ...tree.map((p) => `- ${p}`)];
  for (const key of manifestKeys) {
    const content = repo.files[key];
    if (content === undefined) continue;
    parts.push(`\n## File: ${key}\n\n${content}\n`);
  }
  return parts.join("\n");
}

function normalizeProjectType(raw: unknown): Inventory["project_type"] {
  if (typeof raw !== "string") return "other";
  const s = raw.toLowerCase().replace(/\s+/g, "-");
  if (s === "web-app" || s === "webapp" || s === "web_app") return "web-app";
  if (s === "library" || s === "lib") return "library";
  if (s === "cli") return "cli";
  if (s === "mobile") return "mobile";
  if (s === "other") return "other";
  if (raw === "web app" || s === "web-application") return "web-app";
  if (raw === "CLI") return "cli";
  return "other";
}

function parseInventory(data: unknown): Inventory | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const primary = o.primary_language;
  const libs = o.key_libraries;
  if (typeof primary !== "string" || !Array.isArray(libs)) return null;
  const key_libraries = libs.filter((x): x is string => typeof x === "string").slice(0, 20);
  return {
    primary_language: primary,
    framework: typeof o.framework === "string" ? o.framework : null,
    key_libraries,
    project_type: normalizeProjectType(o.project_type),
    testing_framework: typeof o.testing_framework === "string" ? o.testing_framework : null,
    package_manager: typeof o.package_manager === "string" ? o.package_manager : null,
  };
}

export async function runInventoryPhase(
  repo: FetchedRepo,
  provider: LLMProvider,
  maxTokens: number,
  temperature: number,
): Promise<{ ok: true; inventory: Inventory } | { ok: false; lastText: string }> {
  const manifestKeys = listManifestFiles(repo.files);
  const inventoryContext = buildInventoryContext(repo, manifestKeys);
  const inv = await generateJsonWithRetry(provider, {
    system: INVENTORY_PROMPT,
    user: `Repository: ${repo.identifier}\n\n${inventoryContext}`,
    temperature,
    maxTokens,
  });
  if (!inv.ok) {
    return { ok: false, lastText: inv.lastText };
  }
  const inventory = parseInventory(inv.data);
  if (!inventory) {
    return { ok: false, lastText: JSON.stringify(inv.data).slice(0, 500) };
  }
  return { ok: true, inventory };
}
