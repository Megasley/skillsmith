export type GenerateOpts = {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  expectJson?: boolean;
};

export type GenerateResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Pluggable LLM backend for the agent pipeline.
 */
export interface LLMProvider {
  name: string;
  modelId: string;
  generate(opts: GenerateOpts): Promise<GenerateResult>;
  estimateCostUsd(inputTokens: number, outputTokens: number): number;
}
