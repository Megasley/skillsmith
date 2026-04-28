import type { LLMProvider } from "./types.js";
import { strictJsonTextFromModel } from "./json-strict.js";

type OllamaChatResponse = {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
};

const JSON_SYSTEM_SUFFIX =
  "\n\nRespond with a single valid JSON value only (object or array as appropriate). No markdown, no code fences, no explanation outside JSON.";

export const DEFAULT_OLLAMA_MODEL = "llama3.1";

export function resolveOllamaBaseUrl(): string {
  const fromEnv = process.env.OLLAMA_HOST ?? process.env.OLLAMA_BASE_URL;
  const raw = fromEnv?.trim() || "http://localhost:11434";
  return raw.replace(/\/$/, "");
}

export function createOllamaProvider(baseUrl: string, modelId: string): LLMProvider {
  const base = baseUrl.replace(/\/$/, "");
  return {
    name: "ollama",
    modelId,
    async generate(opts) {
      const system = opts.expectJson ? `${opts.system}${JSON_SYSTEM_SUFFIX}` : opts.system;
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: opts.user },
          ],
          options: { temperature: opts.temperature, num_predict: opts.maxTokens },
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Ollama request failed (${res.status}): ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const raw = data.message?.content ?? "";
      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;
      if (opts.expectJson) {
        return {
          text: strictJsonTextFromModel(raw),
          inputTokens,
          outputTokens,
        };
      }
      return { text: raw, inputTokens, outputTokens };
    },
    estimateCostUsd() {
      return 0;
    },
  };
}
