import OpenAI from "openai";

import type { LLMProvider } from "./types.js";
import { strictJsonTextFromModel } from "./json-strict.js";
import { withOneRetry } from "./retry.js";

// TODO: Confirm current gpt-4o pricing on OpenAI’s pricing page.
const INPUT_PER_M = 2.5;
const OUTPUT_PER_M = 10;

export const DEFAULT_OPENAI_MODEL = "gpt-4o";

export function createOpenAIProvider(apiKey: string, modelId: string): LLMProvider {
  const client = new OpenAI({ apiKey });
  return {
    name: "openai",
    modelId,
    async generate(opts) {
      const run = async () => {
        const res = await client.chat.completions.create({
          model: modelId,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          ...(opts.expectJson ? { response_format: { type: "json_object" as const } } : {}),
        });
        const text = res.choices[0]?.message?.content;
        const raw = typeof text === "string" ? text : "";
        const inputTokens = res.usage?.prompt_tokens ?? 0;
        const outputTokens = res.usage?.completion_tokens ?? 0;
        if (opts.expectJson) {
          return {
            text: strictJsonTextFromModel(raw),
            inputTokens,
            outputTokens,
          };
        }
        return { text: raw, inputTokens, outputTokens };
      };

      return withOneRetry(run, 2000);
    },
    estimateCostUsd(inputTokens: number, outputTokens: number) {
      return (inputTokens / 1_000_000) * INPUT_PER_M + (outputTokens / 1_000_000) * OUTPUT_PER_M;
    },
  };
}
