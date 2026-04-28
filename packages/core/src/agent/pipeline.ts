import type { AgentProgressEvent, AnalysisResult, FetchedRepo, LLMProvider, RunAgentOptions } from "../types.js";
import { detectTaskPatterns } from "./detectTaskPatterns.js";
import { runExtractPhase } from "./extract.js";
import { generateSubagents } from "./generateSubagents.js";
import { runInventoryPhase } from "./inventory.js";
import { applyReducedRules, runRuleReductionPass } from "./reduce-rules.js";
import { sampleRepo } from "./sample.js";

const DEFAULT_MAX_TOKENS = 4096;

export async function* runPipeline(
  repo: FetchedRepo,
  provider: LLMProvider,
  options: RunAgentOptions = {},
): AsyncGenerator<AgentProgressEvent, void, undefined> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const invTemp = options.inventoryTemperature ?? 0.3;
  const extTemp = options.extractTemperature ?? 0.3;

  yield { phase: "inventory", message: "Collecting manifest files and building inventory context." };

  const inv = await runInventoryPhase(repo, provider, maxTokens, invTemp);
  if (!inv.ok) {
    yield {
      phase: "error",
      message: "Model did not return valid JSON for inventory.",
      data: { preview: inv.lastText.slice(0, 500) },
    };
    return;
  }

  yield { phase: "sample", message: "Scoring and sampling source files for conventions pass." };

  const sample = sampleRepo(repo);
  if (!sample.ok) {
    yield { phase: "error", message: sample.message };
    return;
  }

  yield { phase: "extract", message: "Analyzing conventions with the model." };

  const ext = await runExtractPhase(repo, inv.inventory, sample.context, provider, maxTokens, extTemp);
  if (!ext.ok) {
    yield {
      phase: "error",
      message: "Model did not return valid JSON for conventions extraction.",
      data: { preview: ext.lastText.slice(0, 500) },
    };
    return;
  }

  let conventions = ext.conventions;
  const rules = conventions.things_to_avoid;
  const skipReduce = options.noReduce || rules.length === 0;

  if (!skipReduce) {
    yield { phase: "reduce", message: "Filtering generic rules before synthesis." };
    const reduced = await runRuleReductionPass(conventions.inventory, rules, provider, {
      maxTokens,
      temperature: extTemp,
      debug: Boolean(options.debug),
      debugLog: options.ruleReductionDebugLog,
    });
    if (reduced.ok) {
      conventions = applyReducedRules(conventions, reduced.kept);
    }
  }

  const taskPatterns = detectTaskPatterns(repo);

  let subagents: AnalysisResult["subagents"] = [];
  const skipSubagents = Boolean(options.noSubagents);
  if (!skipSubagents) {
    yield {
      phase: "subagents",
      message: "Generating subagent definitions for detected task patterns.",
    };
    subagents = await generateSubagents(taskPatterns, conventions, provider, {
      maxTokens,
      temperature: extTemp,
    });
  }

  const analysis: AnalysisResult = { conventions, taskPatterns, subagents };

  yield {
    phase: "done",
    message: "Convention extraction complete.",
    data: analysis,
  };
}
