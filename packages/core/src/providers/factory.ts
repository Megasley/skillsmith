import { createAnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic.js";
import { createOllamaProvider, DEFAULT_OLLAMA_MODEL, resolveOllamaBaseUrl } from "./ollama.js";
import { createOpenAIProvider, DEFAULT_OPENAI_MODEL } from "./openai.js";
import type { LLMProvider } from "./types.js";
import type { ProviderConfig } from "../types.js";

/**
 * Create an {@link LLMProvider} from explicit config.
 * API keys: use `apiKey` when set, otherwise `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` from the environment.
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.name) {
    case "anthropic": {
      const key = (config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
      if (!key) {
        throw new Error("Anthropic provider requires apiKey or ANTHROPIC_API_KEY.");
      }
      return createAnthropicProvider(key, config.model ?? DEFAULT_ANTHROPIC_MODEL);
    }
    case "openai": {
      const key = (config.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
      if (!key) {
        throw new Error("OpenAI provider requires apiKey or OPENAI_API_KEY.");
      }
      return createOpenAIProvider(key, config.model ?? DEFAULT_OPENAI_MODEL);
    }
    case "ollama": {
      const base = (config.baseUrl ?? resolveOllamaBaseUrl()).replace(/\/$/, "");
      return createOllamaProvider(base, config.model ?? DEFAULT_OLLAMA_MODEL);
    }
    default: {
      const n = (config as ProviderConfig).name;
      throw new Error(`Unknown provider name: ${n}`);
    }
  }
}

/**
 * Build a provider from environment variables (Anthropic → OpenAI → Ollama fallback).
 */
export function createProviderFromEnv(): LLMProvider {
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return createProvider({
      name: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
    });
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return createProvider({
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    });
  }
  return createProvider({
    name: "ollama",
    baseUrl: resolveOllamaBaseUrl(),
    model: process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
  });
}
