import { CODE_LIKE } from "../fetchers/common.js";
import type { FetchedRepo } from "../types.js";

/** Max scored source files included in the extract-phase context (diversity cap). */
export const MAX_SAMPLES = 32;
/** Max files per parent directory before the diversity pass backfills. */
export const MAX_PER_DIR = 8;

function isTestPath(p: string): boolean {
  const b = p.toLowerCase();
  if (/\.(test|spec)\.(ts|tsx|js|jsx|py|rs|go|rb)$/.test(b)) return true;
  if (b.includes("/__tests__/") || b.includes("/tests/") || b.includes("/test/")) return true;
  return false;
}

export function isNoisePath(p: string): boolean {
  const b = p.toLowerCase();
  if (b.includes("examples/") || b.includes("example/")) return true;
  if (b.includes("fixtures/") || b.includes("fixture/")) return true;
  if (b.includes("demo/") || b.includes("demos/")) return true;
  if (b.includes("/docs/") || b.includes("documentation/")) return true;
  if (b.includes("stories/") || b.includes(".stories.")) return true;
  return false;
}

function isKeyEntryPath(p: string): boolean {
  const b = p.replace(/\\/g, "/");
  if (/\/(src\/)?index\.(ts|tsx|js|jsx)$/.test(b)) return true;
  if (/\/(src\/)?main\.(ts|tsx|js|jsx|rs|go|py)$/.test(b)) return true;
  if (/(^|\/)app\/page\.(tsx|ts|jsx|js)$/.test(b)) return true;
  if (/(^|\/)app\/layout\.(tsx|ts|jsx|js)$/.test(b)) return true;
  if (b.includes("/lib/") && CODE_LIKE.test(b)) return true;
  return false;
}

function inAppSrcLib(p: string): boolean {
  const b = p.replace(/\\/g, "/");
  return b.startsWith("app/") || b.startsWith("src/") || b.startsWith("lib/") || b.includes("/lib/");
}

export function importRefCounts(sourceKeys: string[], files: Record<string, string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const path of sourceKeys) {
    let n = 0;
    for (const [p, c] of Object.entries(files)) {
      if (p === path) continue;
      if (c.includes(path)) n += 1;
    }
    m.set(path, n);
  }
  return m;
}

function scoreFile(path: string, importCounts: Map<string, number>, maxImport: number): number {
  let s = 0;
  if (isNoisePath(path)) s -= 5;
  if (isKeyEntryPath(path)) s += 5;
  if (maxImport > 0 && (importCounts.get(path) ?? 0) === maxImport) s += 3;
  if (isTestPath(path)) s += 3;
  if (inAppSrcLib(path)) s += 2;
  return s;
}

function parentDir(p: string): string {
  const n = p.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  return i === -1 ? "" : n.slice(0, i);
}

export function takeDiverseTop(
  items: { path: string; score: number }[],
  cap: number,
  maxPerDir: number,
): { path: string; score: number }[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out: { path: string; score: number }[] = [];
  const byDir = new Map<string, number>();
  for (const item of sorted) {
    if (out.length >= cap) break;
    const d = parentDir(item.path);
    const n = (byDir.get(d) ?? 0) + 1;
    if (n > maxPerDir) continue;
    byDir.set(d, n);
    out.push(item);
  }
  if (out.length < cap) {
    for (const item of sorted) {
      if (out.length >= cap) break;
      if (out.some((x) => x.path === item.path)) continue;
      out.push(item);
    }
  }
  return out.slice(0, cap);
}

export function buildSamplingContext(
  selected: { path: string; score: number }[],
  files: Record<string, string>,
): string {
  const parts: string[] = ["# Sampled source files\n"];
  for (const { path, score } of selected) {
    const c = files[path] ?? "";
    parts.push(`\n## ${path} (score: ${score})\n\n${c}\n`);
  }
  return parts.join("\n");
}

export type SampleResult =
  | { ok: true; selected: { path: string; score: number }[]; context: string }
  | { ok: false; message: string };

export function sampleRepo(repo: FetchedRepo): SampleResult {
  const sourceKeys = Object.keys(repo.files).filter((p) => CODE_LIKE.test(p) && !isNoisePath(p));
  const imps = importRefCounts(sourceKeys, repo.files);
  const maxImport = sourceKeys.length ? Math.max(...sourceKeys.map((k) => imps.get(k) ?? 0)) : 0;
  const scored = sourceKeys.map((path) => ({
    path,
    score: scoreFile(path, imps, maxImport),
  }));
  const selected = takeDiverseTop(scored, MAX_SAMPLES, MAX_PER_DIR);
  if (selected.length === 0) {
    return {
      ok: false,
      message:
        "No source files found to sample (.ts, .tsx, .js, .jsx, .mjs, .cjs, .mdx, .py, .rs, .go, .rb). The repo may use other extensions, or all matches may live under paths we skip (e.g. docs/, examples/, fixtures/).",
    };
  }
  return { ok: true, selected, context: buildSamplingContext(selected, repo.files) };
}
