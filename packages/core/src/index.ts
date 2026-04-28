export { SKILLSMITH_CORE_VERSION } from "./version.js";

export type {
  Adapter,
  AgentProgressEvent,
  AgentProgressPhase,
  AnalysisResult,
  ClaudeScope,
  Conventions,
  SubagentDefinition,
  FetchedRepo,
  Inventory,
  LLMProvider,
  ProjectCommands,
  ProviderConfig,
  ProviderKind,
  ProviderName,
  RenderFormatsOptions,
  RunAgentOptions,
  TaskPattern,
} from "./types.js";

export { fetchGitHubRepo, fetchRepo, parseGitHubUrl } from "./fetchers/github.js";
export { fetchLocalRepo } from "./fetchers/local.js";
export {
  CODE_LIKE,
  MAX_FILES,
  MAX_FILE_BYTES,
  MANIFEST_BASENAMES,
  SKIPPED_DIR_SEGMENTS,
  hasSkippedPathSegment,
  pathSelectionOrder,
  shouldSkipByExtension,
  sortCollectedPaths,
  takePrioritizedFiles,
} from "./fetchers/common.js";

export { createProvider, createProviderFromEnv } from "./providers/factory.js";
export { createAnthropicProvider } from "./providers/anthropic.js";
export { createOpenAIProvider } from "./providers/openai.js";
export { createOllamaProvider } from "./providers/ollama.js";

export { INVENTORY_PROMPT, EXTRACT_PROMPT } from "./agent/prompts.js";
export { runPipeline } from "./agent/pipeline.js";
export { runInventoryPhase, buildInventoryContext } from "./agent/inventory.js";
export { deriveDomainHints, formatDomainHintPromptSection } from "./agent/domain-hints.js";
export { detectTaskPatterns } from "./agent/detectTaskPatterns.js";
export { generateSubagents, SUBAGENT_GENERATION_SYSTEM } from "./agent/generateSubagents.js";
export { sampleRepo, isNoisePath, MAX_SAMPLES, MAX_PER_DIR } from "./agent/sample.js";
export { runExtractPhase } from "./agent/extract.js";

export {
  adapterRegistry,
  adapters,
  ALL_FORMATS,
  listAdapterFormats,
} from "./adapters/registry.js";
export {
  claudeRelativeFilename,
  normalizeClaudeScope,
  skillsmithClaudeHeader,
} from "./adapters/claude-paths.js";
export { claudeMdAdapter, renderClaudeMd } from "./adapters/claude-md.js";
export { cursorrulesAdapter, renderCursorrules } from "./adapters/cursorrules.js";
export { agentsMdAdapter, renderAgentsMd } from "./adapters/agents-md.js";
export { copilotAdapter, renderCopilot } from "./adapters/copilot.js";
export {
  buildAgentsJsonManifest,
  compileAgentsJson,
  compileClaudeCodeSubagent,
  compileCursorSubagent,
  stripToolReferencesPreamble,
  subagentFileStem,
  type AgentsJsonManifest,
} from "./adapters/subagentAdapters.js";
export { AgentsJsonParseError, parseAgentsJsonFromText } from "./adapters/agentsJsonParse.js";
export {
  writeSubagentOutputs,
  writeSubagentsForCompileTarget,
  type SubagentCompileTarget,
  type SubagentWriteRecord,
} from "./adapters/subagentWriter.js";

export { detectExistingFormats } from "./detect.js";
export { estimateCost } from "./cost.js";

import { runPipeline } from "./agent/pipeline.js";
import { adapterRegistry } from "./adapters/registry.js";
import type {
  AgentProgressEvent,
  Conventions,
  FetchedRepo,
  LLMProvider,
  RenderFormatsOptions,
  RunAgentOptions,
} from "./types.js";
import { claudeRelativeFilename } from "./adapters/claude-paths.js";
import { renderClaudeMd } from "./adapters/claude-md.js";

/**
 * Run inventory → sample → extract, yielding progress events.
 * On success, the final event has `phase: "done"` and `data` is an {@link AnalysisResult} (`conventions` + `taskPatterns`).
 */
export async function* runAgent(
  repo: FetchedRepo,
  provider: LLMProvider,
  options?: RunAgentOptions,
): AsyncGenerator<AgentProgressEvent, void, undefined> {
  yield* runPipeline(repo, provider, options);
}

/**
 * Render selected adapter formats into filename + content pairs.
 */
export async function renderFormats(
  conv: Conventions,
  formats: string[],
  provider?: LLMProvider,
  options?: RenderFormatsOptions,
): Promise<Record<string, { filename: string; content: string }>> {
  const claudeScope = options?.claudeScope ?? "project";
  const out: Record<string, { filename: string; content: string }> = {};
  for (const name of formats) {
    if (name === "claude-md") {
      const filename = claudeRelativeFilename(claudeScope);
      const content = renderClaudeMd(conv, { scope: claudeScope });
      out[name] = { filename, content };
      continue;
    }
    const adapter = adapterRegistry.get(name);
    if (!adapter) continue;
    const content = await adapter.render(conv, provider);
    out[name] = { filename: adapter.filename, content };
  }
  return out;
}
