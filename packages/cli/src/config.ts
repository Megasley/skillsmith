import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeClaudeScope, type ClaudeScope, type ProviderKind } from "@skillsmith/core";

import type { ResolvedTarget } from "./target.js";

export const CONFIG_DIR = path.join(os.homedir(), ".skillsmith");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export type FileConfig = {
  provider?: string;
  apiKey?: string;
  formats?: string[];
  outputDir?: string;
};

export function readConfigFile(): FileConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as FileConfig;
  } catch {
    return {};
  }
}

export function normalizeProvider(p: string | undefined): ProviderKind {
  const s = (p ?? "").toLowerCase().trim();
  if (s === "openai" || s === "ollama") {
    return s;
  }
  return "anthropic";
}

function envApiKeyForProvider(provider: ProviderKind): string {
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  }
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() ?? "";
  }
  return "";
}

export type GenerateCliOptions = {
  apiKey?: string;
  provider?: string;
  formats?: string;
  outputDir?: string;
  yes?: boolean;
  json?: boolean;
  quiet?: boolean;
  noReduce?: boolean;
  /** Skip LLM subagent definition generation (task patterns still detected). */
  noSubagents?: boolean;
  /** Do not write compiled subagents (.claude/agents, agents.json, optional Cursor). Default: write. */
  noSubagentOutput?: boolean;
  /** With subagent files: also write Cursor .mdc under .cursor/rules. */
  cursor?: boolean;
  debug?: boolean;
  /** claude-md output: project | global | local */
  scope?: string;
};

export type MergedGenerateConfig = {
  provider: ProviderKind;
  apiKey: string;
  formatsCsv: string | undefined;
  yes: boolean;
  json: boolean;
  quiet: boolean;
  noReduce: boolean;
  noSubagents: boolean;
  /** Write compiled subagent files (Claude, agents.json, optional Cursor). */
  writeSubagents: boolean;
  cursorSubagents: boolean;
  debug: boolean;
  claudeScope: ClaudeScope;
};

/**
 * Merge config: CLI flags > env > ~/.skillsmith/config.json > defaults.
 */
export function mergeGenerateConfig(cwd: string, flags: GenerateCliOptions): MergedGenerateConfig {
  const file = readConfigFile();

  const provider = normalizeProvider(
    flags.provider ?? process.env.SKILLSMITH_PROVIDER ?? file.provider,
  );

  const apiKeyFlag = flags.apiKey?.trim() ?? "";
  const apiKeyEnv = envApiKeyForProvider(provider);
  const apiKeyFile = (file.apiKey ?? "").trim();
  const apiKey = apiKeyFlag || apiKeyEnv || (provider === "ollama" ? "" : apiKeyFile);

  const formatsCsv =
    flags.formats?.trim() || (file.formats?.length ? file.formats.join(",") : undefined);

  return {
    provider,
    apiKey,
    formatsCsv,
    yes: Boolean(flags.yes),
    json: Boolean(flags.json),
    quiet: Boolean(flags.quiet),
    noReduce: Boolean(flags.noReduce),
    noSubagents: Boolean(flags.noSubagents),
    writeSubagents: !Boolean(flags.noSubagentOutput),
    cursorSubagents: Boolean(flags.cursor),
    debug: Boolean(flags.debug),
    claudeScope: normalizeClaudeScope(flags.scope),
  };
}

/**
 * Output directory: CLI flag > config file > local target root, else cwd (remote).
 */
export function resolveOutputDir(cwd: string, flags: GenerateCliOptions, target: ResolvedTarget): string {
  const file = readConfigFile();
  const a = flags.outputDir?.trim();
  const b = file.outputDir?.trim();
  if (a) {
    return path.resolve(cwd, a);
  }
  if (b) {
    return path.resolve(cwd, b);
  }
  return target.kind === "local" ? target.absolutePath : cwd;
}

export function needsApiKey(provider: ProviderKind, apiKey: string): boolean {
  if (provider === "ollama") {
    return false;
  }
  return !apiKey.trim();
}
