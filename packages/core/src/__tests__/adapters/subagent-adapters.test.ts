import { describe, expect, it } from "vitest";

import {
  buildAgentsJsonManifest,
  compileClaudeCodeSubagent,
  compileCursorSubagent,
  stripToolReferencesPreamble,
} from "../../adapters/subagentAdapters.js";
import type { SubagentDefinition } from "../../types.js";

const sampleDef = (): SubagentDefinition => ({
  id: "code-reviewer",
  name: "Code Reviewer",
  description: "Review changes before merge.",
  tools: ["Read", "Grep", "Glob"],
  model: "sonnet",
  systemPrompt: "Focus on correctness.\n\nUse the repo conventions.",
  repoScoped: true,
  confidence: "high",
  domainHints: ["ai"],
});

describe("compileClaudeCodeSubagent", () => {
  it("includes YAML frontmatter and body", () => {
    const md = compileClaudeCodeSubagent(sampleDef());
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("name:");
    expect(md).toContain("tools:");
    expect(md).toContain("Read, Grep, Glob");
    expect(md).toContain("model: sonnet");
    expect(md).toContain("Focus on correctness.");
  });
});

describe("compileCursorSubagent", () => {
  it("uses mdc frontmatter and strips tool preamble", () => {
    const def = sampleDef();
    def.systemPrompt =
      "You may use Read, Grep, and Glob to explore.\n\nActually review the code carefully.";
    const mdc = compileCursorSubagent(def);
    expect(mdc).toContain("alwaysApply: false");
    expect(mdc).toContain("globs: []");
    expect(mdc).toContain("Actually review the code carefully.");
    expect(mdc).not.toContain("You may use Read");
  });
});

describe("stripToolReferencesPreamble", () => {
  it("leaves body when no tool preamble", () => {
    expect(stripToolReferencesPreamble("Hello\n\nWorld")).toBe("Hello\n\nWorld");
  });
});

describe("buildAgentsJsonManifest", () => {
  it("matches schema", () => {
    const m = buildAgentsJsonManifest([sampleDef()], new Date("2026-01-15T12:00:00.000Z"));
    expect(m.version).toBe("1.0");
    expect(m.generatedBy).toBe("skillsmith");
    expect(m.generatedAt).toBe("2026-01-15T12:00:00.000Z");
    expect(m.agents).toHaveLength(1);
    expect(m.agents[0]!.id).toBe("code-reviewer");
    expect(m.agents[0]!.domainHints).toEqual(["ai"]);
  });
});
