import type { FetchedRepo, LLMProvider } from "./types.js";

/** Reference repo size for the heuristic (file count). */
const FILE_REF = 200;
/** Baseline total input tokens for ~4 LLM calls on a FILE_REF-sized repo. */
const BASE_INPUT_TOKENS = 30_000;
/** Baseline total output tokens for the same run. */
const BASE_OUTPUT_TOKENS = 6000;

/**
 * Rough USD band for running the default extraction pipeline on `repo` with `provider`.
 * Assumes ~4 LLM calls totaling ~30k input / ~6k output tokens for a 200-file repo, scaled by `tree.length`,
 * then applies `provider.estimateCostUsd`. Returns ±50% around the midpoint.
 */
export function estimateCost(
  repo: FetchedRepo,
  provider: LLMProvider,
): { lowUsd: number; highUsd: number; model: string } {
  const scale = Math.max(0.25, Math.min(repo.tree.length / FILE_REF, 4));
  const inputTokens = Math.round(BASE_INPUT_TOKENS * scale);
  const outputTokens = Math.round(BASE_OUTPUT_TOKENS * scale);
  const mid = provider.estimateCostUsd(inputTokens, outputTokens);
  return {
    lowUsd: Math.round(mid * 0.5 * 10_000) / 10_000,
    highUsd: Math.round(mid * 1.5 * 10_000) / 10_000,
    model: provider.modelId,
  };
}
