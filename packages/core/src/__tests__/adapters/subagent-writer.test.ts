import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { writeSubagentOutputs, writeSubagentsForCompileTarget } from "../../adapters/subagentWriter.js";
import type { SubagentDefinition } from "../../types.js";

/** Workspace-local temp root so tests can create `.cursor` (sandbox may block os.tmpdir()). */
const corePkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const testTmpRoot = path.join(corePkgRoot, ".vitest-tmp");

async function mkTestDir(prefix: string): Promise<string> {
  await mkdir(testTmpRoot, { recursive: true });
  return mkdtemp(path.join(testTmpRoot, prefix));
}

const oneAgent = (): SubagentDefinition[] => [
  {
    id: "test-agent",
    name: "Test",
    description: "Test agent.",
    tools: ["Read"],
    model: "haiku",
    systemPrompt: "Do the thing.",
    repoScoped: true,
    confidence: "high",
    domainHints: [],
  },
];

describe("writeSubagentOutputs", () => {
  it("writes agents.json and Claude files when write is true", async () => {
    const dir = await mkTestDir("skillsmith-sub-");
    try {
      const rec = await writeSubagentOutputs(dir, oneAgent(), { write: true, cursor: false });
      const rels = rec.map((r) => r.relativePath).sort();
      expect(rels).toContain("agents.json");
      expect(rels.some((r) => r.includes(".claude/agents"))).toBe(true);
      const json = JSON.parse(await readFile(path.join(dir, "agents.json"), "utf8"));
      expect(json.agents).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes cursor mdc when cursor is true", async () => {
    const dir = await mkTestDir("skillsmith-subc-");
    try {
      const rec = await writeSubagentOutputs(dir, oneAgent(), { write: true, cursor: true });
      expect(rec.some((r) => r.relativePath.includes(".cursor/rules"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty when write is false", async () => {
    const dir = await mkTestDir("skillsmith-subx-");
    try {
      const rec = await writeSubagentOutputs(dir, oneAgent(), { write: false, cursor: true });
      expect(rec).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writeSubagentsForCompileTarget writes only Claude files", async () => {
    const dir = await mkTestDir("skillsmith-cmp-claude-");
    try {
      const rec = await writeSubagentsForCompileTarget(dir, oneAgent(), "claude-code");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.relativePath).toMatch(/^\.claude\/agents\//);
      expect(rec.some((r) => r.relativePath.includes("agents.json"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writeSubagentsForCompileTarget writes only Cursor files", async () => {
    const dir = await mkTestDir("skillsmith-cmp-cursor-");
    try {
      const rec = await writeSubagentsForCompileTarget(dir, oneAgent(), "cursor");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.relativePath).toMatch(/^\.cursor\/rules\/skillsmith-/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
