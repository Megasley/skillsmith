import { describe, expect, it } from "vitest";

import { AgentsJsonParseError, parseAgentsJsonFromText } from "../../adapters/agentsJsonParse.js";

const minimalValid = `{
  "version": "1.0",
  "agents": [
    {
      "id": "a1",
      "name": "A",
      "description": "Desc",
      "tools": ["Read"],
      "model": "sonnet",
      "systemPrompt": "Do work.",
      "repoScoped": true,
      "domainHints": ["x"]
    }
  ]
}`;

describe("parseAgentsJsonFromText", () => {
  it("parses a valid manifest", () => {
    const defs = parseAgentsJsonFromText(minimalValid);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({
      id: "a1",
      name: "A",
      description: "Desc",
      tools: ["Read"],
      model: "sonnet",
      systemPrompt: "Do work.",
      repoScoped: true,
      domainHints: ["x"],
      confidence: "medium",
    });
  });

  it("defaults optional agent fields", () => {
    const text = JSON.stringify({
      version: "1.0",
      agents: [
        {
          id: "b",
          name: "B",
          description: "D",
          systemPrompt: "Body.",
        },
      ],
    });
    const [a] = parseAgentsJsonFromText(text);
    expect(a!.tools).toEqual([]);
    expect(a!.model).toBe("haiku");
    expect(a!.repoScoped).toBe(true);
    expect(a!.domainHints).toEqual([]);
    expect(a!.confidence).toBe("medium");
  });

  it("accepts empty agents", () => {
    expect(parseAgentsJsonFromText('{"agents":[]}')).toEqual([]);
  });

  it("rejects bad JSON", () => {
    expect(() => parseAgentsJsonFromText("{")).toThrow(AgentsJsonParseError);
  });

  it("rejects wrong version", () => {
    expect(() =>
      parseAgentsJsonFromText('{"version":"2.0","agents":[]}'),
    ).toThrow(/Unsupported agents\.json version/);
  });

  it("rejects missing agents array", () => {
    expect(() => parseAgentsJsonFromText("{}")).toThrow(/"agents"/);
  });
});
