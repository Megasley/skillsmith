import fs from "node:fs/promises";
import path from "node:path";

import chalk from "chalk";
import {
  AgentsJsonParseError,
  parseAgentsJsonFromText,
  writeSubagentsForCompileTarget,
  type SubagentCompileTarget,
} from "@skillsmith/core";

import { formatBytes } from "../util.js";

export type CompileCliOptions = {
  from: string;
  target: SubagentCompileTarget;
  outputDir?: string;
  json?: boolean;
  quiet?: boolean;
};

export async function runCompile(cwd: string, options: CompileCliOptions): Promise<void> {
  const fromPath = path.resolve(cwd, options.from);

  let text: string;
  try {
    text = await fs.readFile(fromPath, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      console.error(chalk.red(`✗ No such file: ${fromPath}`));
      process.exit(2);
    }
    throw e;
  }

  let defs;
  try {
    defs = parseAgentsJsonFromText(text);
  } catch (e) {
    if (e instanceof AgentsJsonParseError) {
      console.error(chalk.red(`✗ ${e.message}`));
      process.exit(2);
    }
    throw e;
  }

  const outDir = options.outputDir?.trim()
    ? path.resolve(cwd, options.outputDir.trim())
    : path.dirname(fromPath);

  const written = await writeSubagentsForCompileTarget(outDir, defs, options.target);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          from: fromPath,
          outputDir: outDir,
          target: options.target,
          agentCount: defs.length,
          files: written,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (defs.length === 0) {
    if (!options.quiet) {
      console.log(chalk.yellow("agents.json has no agents; nothing to write."));
    }
    return;
  }

  if (!options.quiet) {
    for (const r of written) {
      console.log(chalk.green(`✓ Wrote ${r.relativePath} (${formatBytes(r.bytes)})`));
    }
  }
}
