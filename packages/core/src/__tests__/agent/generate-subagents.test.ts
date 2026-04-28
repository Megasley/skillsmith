import { describe, expect, it } from "vitest";

import { generateSubagents } from "../../agent/generateSubagents.js";
import type { LLMProvider, TaskPattern } from "../../types.js";
import { loadSampleConventions } from "../load-fixture.js";

function mockProvider(responseText: string): LLMProvider {
  return {
    name: "mock",
    modelId: "mock",
    async generate() {
      return { text: responseText, inputTokens: 1, outputTokens: 2 };
    },
    estimateCostUsd: () => 0,
  };
}

describe("generateSubagents", () => {
  it("calls LLM only for high and medium confidence patterns", async () => {
    const patterns: TaskPattern[] = [
      { id: "code-reviewer", name: "CR", description: "d", confidence: "high", detectedFrom: [] },
      { id: "skip-me", name: "S", description: "d", confidence: "low", detectedFrom: [] },
    ];
    const body = {
      id: "code-reviewer",
      name: "Code Reviewer",
      description: "Review PRs before merge.",
      tools: ["Read", "Grep", "Glob"],
      model: "sonnet",
      systemPrompt: "Use project conventions. Prefer extending lib/utils.",
      repoScoped: true,
    };
    const sub = await generateSubagents(
      patterns,
      loadSampleConventions(),
      mockProvider(JSON.stringify(body)),
      { maxTokens: 2048, temperature: 0.2 },
    );
    expect(sub).toHaveLength(1);
    expect(sub[0]!.id).toBe("code-reviewer");
    expect(sub[0]!.confidence).toBe("high");
    expect(sub[0]!.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(sub[0]!.model).toBe("sonnet");
    expect(sub[0]!.domainHints).toEqual([]);
  });

  it("skips patterns when JSON is invalid", async () => {
    const patterns: TaskPattern[] = [
      { id: "code-reviewer", name: "CR", description: "d", confidence: "high", detectedFrom: [] },
    ];
    const sub = await generateSubagents(patterns, loadSampleConventions(), mockProvider("not json"), {
      maxTokens: 2048,
      temperature: 0.2,
    });
    expect(sub).toHaveLength(0);
  });
});
