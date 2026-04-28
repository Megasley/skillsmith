import fs from "node:fs/promises";
import path from "node:path";

import type { SubagentDefinition } from "../types.js";
import {
  compileAgentsJson,
  compileClaudeCodeSubagent,
  compileCursorSubagent,
  subagentFileStem,
} from "./subagentAdapters.js";

export type SubagentWriteRecord = {
  /** Path relative to output dir (POSIX-style for display). */
  relativePath: string;
  bytes: number;
};

export type WriteSubagentOutputsOptions = {
  /** When false, skip all subagent file writes. */
  write: boolean;
  /** When true, also write Cursor `.mdc` files under `.cursor/rules/`. */
  cursor: boolean;
};

/** Output format for `skillsmith compile` (no repo analysis). */
export type SubagentCompileTarget = "cursor" | "claude-code";

/**
 * Write compiled subagents:
 * - `.claude/agents/{id}.md` (Claude Code) when `write` is true
 * - `agents.json` at repo root when `write` is true (may be empty `agents`)
 * - `.cursor/rules/skillsmith-{id}.mdc` when `write && cursor`
 */
export async function writeSubagentOutputs(
  outDir: string,
  subagents: SubagentDefinition[],
  options: WriteSubagentOutputsOptions,
): Promise<SubagentWriteRecord[]> {
  if (!options.write) {
    return [];
  }

  const records: SubagentWriteRecord[] = [];
  const root = path.resolve(outDir);

  if (subagents.length > 0) {
    const agentsDir = path.join(root, ".claude", "agents");
    await fs.mkdir(agentsDir, { recursive: true });

    for (const def of subagents) {
      const stem = subagentFileStem(def.id);
      const claudePath = path.join(agentsDir, `${stem}.md`);
      const claudeContent = compileClaudeCodeSubagent(def);
      await fs.writeFile(claudePath, claudeContent, "utf8");
      const claudeRel = path.posix.join(".claude", "agents", `${stem}.md`);
      records.push({ relativePath: claudeRel, bytes: Buffer.byteLength(claudeContent, "utf8") });

      if (options.cursor) {
        const cursorDir = path.join(root, ".cursor", "rules");
        await fs.mkdir(cursorDir, { recursive: true });
        const cursorPath = path.join(cursorDir, `skillsmith-${stem}.mdc`);
        const cursorContent = compileCursorSubagent(def);
        await fs.writeFile(cursorPath, cursorContent, "utf8");
        const cursorRel = path.posix.join(".cursor", "rules", `skillsmith-${stem}.mdc`);
        records.push({ relativePath: cursorRel, bytes: Buffer.byteLength(cursorContent, "utf8") });
      }
    }
  }

  const manifestPath = path.join(root, "agents.json");
  const manifestContent = compileAgentsJson(subagents);
  await fs.writeFile(manifestPath, manifestContent, "utf8");
  records.push({ relativePath: "agents.json", bytes: Buffer.byteLength(manifestContent, "utf8") });

  return records;
}

/**
 * Write compiled subagents for a single target (used by `skillsmith compile`).
 * Does not write or modify `agents.json`.
 */
export async function writeSubagentsForCompileTarget(
  outDir: string,
  subagents: SubagentDefinition[],
  target: SubagentCompileTarget,
): Promise<SubagentWriteRecord[]> {
  if (subagents.length === 0) {
    return [];
  }

  const records: SubagentWriteRecord[] = [];
  const root = path.resolve(outDir);

  if (target === "claude-code") {
    const agentsDir = path.join(root, ".claude", "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    for (const def of subagents) {
      const stem = subagentFileStem(def.id);
      const claudePath = path.join(agentsDir, `${stem}.md`);
      const claudeContent = compileClaudeCodeSubagent(def);
      await fs.writeFile(claudePath, claudeContent, "utf8");
      const claudeRel = path.posix.join(".claude", "agents", `${stem}.md`);
      records.push({ relativePath: claudeRel, bytes: Buffer.byteLength(claudeContent, "utf8") });
    }
    return records;
  }

  const cursorDir = path.join(root, ".cursor", "rules");
  await fs.mkdir(cursorDir, { recursive: true });
  for (const def of subagents) {
    const stem = subagentFileStem(def.id);
    const cursorPath = path.join(cursorDir, `skillsmith-${stem}.mdc`);
    const cursorContent = compileCursorSubagent(def);
    await fs.writeFile(cursorPath, cursorContent, "utf8");
    const cursorRel = path.posix.join(".cursor", "rules", `skillsmith-${stem}.mdc`);
    records.push({ relativePath: cursorRel, bytes: Buffer.byteLength(cursorContent, "utf8") });
  }
  return records;
}
