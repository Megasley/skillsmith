export interface FetchedRepo {
  source: "github" | "local";
  identifier: string;
  tree: string[];
  files: Record<string, string>;
  truncated: boolean;
}

export interface Inventory {
  primary_language: string;
  framework: string | null;
  key_libraries: string[];
  project_type: "web-app" | "library" | "cli" | "mobile" | "other";
  testing_framework: string | null;
  package_manager: string | null;
}

/** Runnable commands inferred from manifests only (see deriveProjectCommands). */
export interface ProjectCommands {
  install: string | null;
  dev: string | null;
  build: string | null;
  test_all: string | null;
  test_single: string | null;
  lint: string | null;
  lint_fix: string | null;
  typecheck: string | null;
  format: string | null;
}

export interface Conventions {
  inventory: Inventory;
  commands: ProjectCommands;
  /** Tags inferred from manifest dependencies (see deriveDomainHints). */
  domainHints: string[];
  naming: {
    files: string;
    components: string;
    functions: string;
    variables: string;
  };
  file_organization: string;
  error_handling: string;
  state_management: string;
  testing_patterns: string;
  common_abstractions: Array<{ name: string; purpose: string; example_path: string }>;
  things_to_avoid: string[];
  primary_skill: { name: string; procedure: string };
}

/** Subagent-style task preset detected from repo heuristics (see detectTaskPatterns). */
export interface TaskPattern {
  id: string;
  name: string;
  description: string;
  confidence: "high" | "medium" | "low";
  detectedFrom: string[];
}

/** Claude Code–style subagent spec (generated from task patterns + conventions). */
export interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  tools: string[];
  /** Claude Code model hint (e.g. haiku, sonnet, opus, or provider-specific id). */
  model: string;
  systemPrompt: string;
  repoScoped: boolean;
  confidence: "high" | "medium" | "low";
  /** Same domain tags as conventions.domainHints at generation time (transparency). */
  domainHints: string[];
}

/** Full pipeline output: conventions, heuristics, and optional LLM-generated subagents. */
export interface AnalysisResult {
  conventions: Conventions;
  taskPatterns: TaskPattern[];
  subagents: SubagentDefinition[];
}

import type { LLMProvider } from "./providers/types.js";

export type { LLMProvider };

export type ProviderName = "anthropic" | "openai" | "ollama";

/** @deprecated Use {@link ProviderName} */
export type ProviderKind = ProviderName;

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  model?: string;
  /** Ollama base URL only; default http://localhost:11434 */
  baseUrl?: string;
}

/** Where to write Claude Code–style `CLAUDE.md` output. */
export type ClaudeScope = "project" | "global" | "local";

export type RenderFormatsOptions = {
  /** Default `project`. `global` is CLI-oriented (writes under `~/.claude/`). */
  claudeScope?: ClaudeScope;
};

export interface Adapter {
  format: string;
  filename: string;
  render(conv: Conventions, provider?: LLMProvider): Promise<string>;
}

export type AgentProgressPhase =
  | "inventory"
  | "sample"
  | "extract"
  | "reduce"
  | "subagents"
  | "done"
  | "error";

export type AgentProgressEvent = {
  phase: AgentProgressPhase;
  message: string;
  data?: unknown;
};

export type RunAgentOptions = {
  maxTokens?: number;
  inventoryTemperature?: number;
  extractTemperature?: number;
  /** Skip the post-extract rule-reduction LLM pass (things_to_avoid filter). */
  noReduce?: boolean;
  /** When true, rule reduction logs removed rules and reasons to stderr (or {@link ruleReductionDebugLog}). */
  debug?: boolean;
  /** Override stderr logging for rule-reduction debug output (e.g. tests). */
  ruleReductionDebugLog?: (line: string) => void;
  /** Skip LLM subagent generation (task patterns still returned). */
  noSubagents?: boolean;
};
