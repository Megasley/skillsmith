import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";

import type { LLMProvider } from "./types.js";
import { strictJsonTextFromModel } from "./json-strict.js";
import { withOneRetry } from "./retry.js";

function messageText(m: Message): string {
  return m.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");
}

// TODO: Confirm Sonnet 4.6 list pricing; these are common Sonnet-class defaults.
const INPUT_PER_M = 3;
const OUTPUT_PER_M = 15;

const JSON_SYSTEM_SUFFIX =
  "\n\nRespond with a single valid JSON value only (object or array as appropriate). No markdown, no code fences, no explanation outside JSON.";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

export function createAnthropicProvider(apiKey: string, modelId: string): LLMProvider {
  const client = new Anthropic({ apiKey });
  return {
    name: "anthropic",
    modelId,
    async generate(opts) {
      const system = opts.expectJson ? `${opts.system}${JSON_SYSTEM_SUFFIX}` : opts.system;

      const run = async () => {
        const m = await client.messages.create({
          model: modelId,
          max_tokens: opts.maxTokens,
          temperature: opts.temperature,
          system,
          messages: [{ role: "user", content: opts.user }],
        });
        const text = messageText(m);
        const inputTokens = m.usage?.input_tokens ?? 0;
        const outputTokens = m.usage?.output_tokens ?? 0;
        if (opts.expectJson) {
          return {
            text: strictJsonTextFromModel(text),
            inputTokens,
            outputTokens,
          };
        }
        return { text, inputTokens, outputTokens };
      };

      return withOneRetry(run, 2000);
    },
    estimateCostUsd(inputTokens: number, outputTokens: number) {
      return (inputTokens / 1_000_000) * INPUT_PER_M + (outputTokens / 1_000_000) * OUTPUT_PER_M;
    },
  };
}
