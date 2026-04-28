import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import chalk from "chalk";
import type { ClaudeScope, ProviderKind } from "@skillsmith/core";
import {
  createProvider,
  detectExistingFormats,
  estimateCost,
  fetchLocalRepo,
  fetchRepo,
  renderFormats,
  runAgent,
  writeSubagentOutputs,
  type Conventions,
  type SubagentDefinition,
  type TaskPattern,
} from "@skillsmith/core";

function printSubagentSummary(opts: {
  subagents: SubagentDefinition[];
  writeSubagents: boolean;
  cursorSubagents: boolean;
  noSubagentsLlm: boolean;
  log: (line: string) => void;
}): void {
  const { subagents, writeSubagents, cursorSubagents, noSubagentsLlm, log } = opts;

  if (!writeSubagents) {
    log(chalk.dim("Subagent files skipped (--no-subagent-output)."));
    return;
  }

  const n = subagents.length;
  if (n > 0) {
    log("");
    log(chalk.green(`✓ Generated ${n} subagent${n === 1 ? "" : "s"} → .claude/agents/`));
    const maxIdLen = Math.max(...subagents.map((s) => s.id.length), 4);
    for (const s of subagents) {
      const padded = s.id.padEnd(maxIdLen);
      log(chalk.dim(`  · ${padded}  (${s.confidence} confidence)`));
    }
    log("");
    log(chalk.green("Portable manifest → agents.json"));
    log(
      cursorSubagents
        ? chalk.green("Cursor rules → .cursor/rules/skillsmith-*.mdc")
        : chalk.dim("Cursor rules → skipped (use --cursor to enable)"),
    );
    return;
  }

  log("");
  if (noSubagentsLlm) {
    log(chalk.dim("Subagent generation skipped (--no-subagents)."));
  } else {
    log(chalk.dim("No subagents produced; manifest is empty."));
  }
  log(chalk.green("Portable manifest → agents.json"));
  log(
    cursorSubagents
      ? chalk.dim("Cursor rules → skipped (no subagent definitions to compile)")
      : chalk.dim("Cursor rules → skipped (use --cursor to enable)"),
  );
}

import {
  mergeGenerateConfig,
  needsApiKey,
  resolveOutputDir,
  type GenerateCliOptions,
} from "../config.js";
import { resolveTarget, type ResolvedTarget } from "../target.js";
import { printCostPreview } from "../ui/cost.js";
import { confirmContinue } from "../ui/prompt.js";
import { PhaseSpinner } from "../ui/spinner.js";
import {
  ALL_FORMAT_IDS,
  formatBytes,
  mapDetectedToFormats,
  parseFormatsCsv,
  type FormatId,
} from "../util.js";

function printNoApiKeyHelp(): void {
  console.error(`✗ No API key found.

  Skillsmith uses an LLM to analyze your codebase. You'll need an API key.

  1. Get one:
     Anthropic:  https://console.anthropic.com/
     OpenAI:     https://platform.openai.com/api-keys
     Or run:     ollama pull llama3.1  (free, local)

  2. Set it:
     export ANTHROPIC_API_KEY=sk-ant-...

  3. Or run:
     skillsmith init

  A typical run costs about $0.20 in API usage.
`);
}

function makeProvider(kind: ProviderKind, apiKey: string) {
  if (kind === "ollama") {
    return createProvider({ name: "ollama" });
  }
  return createProvider({ name: kind, apiKey: apiKey.trim() });
}

async function loadRepo(target: ResolvedTarget, githubToken: string | undefined) {
  if (target.kind === "local") {
    return fetchLocalRepo(target.absolutePath);
  }
  return fetchRepo(target.url, githubToken);
}

function resolveOutputFilePath(
  outDir: string,
  formatId: string,
  filename: string,
  claudeScope: ClaudeScope,
): { absPath: string; displayPath: string } {
  if (formatId === "claude-md" && claudeScope === "global") {
    const absPath = path.join(os.homedir(), ".claude", "CLAUDE.md");
    return { absPath, displayPath: path.join("~", ".claude", "CLAUDE.md") };
  }
  return { absPath: path.join(outDir, filename), displayPath: filename };
}

function targetLineForPreview(target: ResolvedTarget, cwd: string): string {
  if (target.kind === "local") {
    const rel = path.relative(cwd, target.absolutePath);
    return rel && !rel.startsWith("..") ? rel : target.absolutePath;
  }
  return target.display;
}

export async function runGenerate(rawTarget: string | undefined, opts: GenerateCliOptions): Promise<void> {
  const cwd = process.cwd();
  let target: ResolvedTarget;
  try {
    target = resolveTarget(rawTarget, cwd);
  } catch (e) {
    console.error(chalk.red(e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }

  const merged = mergeGenerateConfig(cwd, opts);
  const outDir = resolveOutputDir(cwd, opts, target);

  if (needsApiKey(merged.provider, merged.apiKey)) {
    printNoApiKeyHelp();
    process.exit(1);
  }

  let repo: Awaited<ReturnType<typeof loadRepo>>;
  try {
    repo = await loadRepo(target, process.env.GITHUB_TOKEN);
  } catch (e) {
    console.error(chalk.red(e instanceof Error ? e.message : "Failed to load repository"));
    process.exit(2);
  }

  const detectedRaw = detectExistingFormats(repo);
  let formats: FormatId[];
  if (merged.formatsCsv) {
    formats = parseFormatsCsv(merged.formatsCsv) ?? [...ALL_FORMAT_IDS];
  } else {
    const mapped = mapDetectedToFormats(detectedRaw);
    formats = mapped.length > 0 ? mapped : [...ALL_FORMAT_IDS];
  }

  if (!merged.quiet && !merged.json) {
    console.log(
      chalk.dim(
        `Detected in snapshot: ${detectedRaw.length ? detectedRaw.join(", ") : "(none)"} → output: ${formats.join(", ")}`,
      ),
    );
  }

  let llm: ReturnType<typeof makeProvider>;
  try {
    llm = makeProvider(merged.provider, merged.apiKey);
  } catch (e) {
    console.error(chalk.red(e instanceof Error ? e.message : "Invalid provider"));
    process.exit(1);
  }

  const cost = estimateCost(repo, llm);
  const fileCount = repo.tree.length;
  const targetDisplay = targetLineForPreview(target, cwd);
  const formatLabels = formats.map((f) => {
    const labels: Record<FormatId, string> = {
      "claude-md": ".claude/CLAUDE.md",
      cursorrules: ".cursorrules",
      "agents-md": "AGENTS.md",
      copilot: ".github/copilot-instructions.md",
    };
    return labels[f];
  });

  const logLine = (s: string) => {
    if (!merged.quiet && !merged.json) {
      console.log(s);
    }
  };

  printCostPreview(
    {
      targetDisplay,
      fileCount,
      provider: merged.provider,
      model: llm.modelId,
      formatLabels,
      lowUsd: cost.lowUsd,
      highUsd: cost.highUsd,
    },
    logLine,
  );

  const skipConfirm = merged.yes || merged.quiet || merged.json;
  if (!skipConfirm) {
    const ok = await confirmContinue("Continue? (Y/n)", true);
    if (!ok) {
      console.error(chalk.yellow("Aborted."));
      process.exit(1);
    }
  }

  const started = Date.now();
  const spinner = new PhaseSpinner(merged.quiet || merged.json);
  spinner.start();

  let conventions: Conventions | undefined;
  let taskPatterns: TaskPattern[] | undefined;
  let subagents: SubagentDefinition[] | undefined;
  let agentError: string | undefined;

  try {
    try {
      for await (const event of runAgent(repo, llm, {
        noReduce: merged.noReduce,
        debug: merged.debug,
        noSubagents: merged.noSubagents,
      })) {
        if (event.phase === "error") {
          agentError = event.message;
          break;
        }
        spinner.onAgentPhase(event.phase);
        if (event.phase === "done" && event.data && typeof event.data === "object") {
          const d = event.data as {
            conventions?: Conventions;
            taskPatterns?: TaskPattern[];
            subagents?: SubagentDefinition[];
          };
          if (d.conventions) {
            conventions = d.conventions;
          }
          if (Array.isArray(d.taskPatterns)) {
            taskPatterns = d.taskPatterns;
          }
          if (Array.isArray(d.subagents)) {
            subagents = d.subagents;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      spinner.fail(chalk.red(msg));
      process.exit(2);
    }

    if (agentError) {
      spinner.fail(chalk.red(agentError));
      process.exit(1);
    }

    if (!conventions) {
      const msg = "Agent finished without conventions.";
      spinner.fail(chalk.red(msg));
      process.exit(2);
    }

    spinner.startSynthesize();
    let outputs: Record<string, { filename: string; content: string }>;
    try {
      outputs = await renderFormats(conventions, [...formats], llm, {
        claudeScope: merged.claudeScope,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Render failed";
      spinner.fail(chalk.red(msg));
      process.exit(2);
    }

    spinner.succeed();

    const written: Array<{ relativePath: string; bytes: number }> = [];

    for (const formatId of formats) {
      const entry = outputs[formatId];
      if (!entry) continue;
      const { filename, content } = entry;
      const { absPath, displayPath } = resolveOutputFilePath(outDir, formatId, filename, merged.claudeScope);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, "utf8");
      const bytes = Buffer.byteLength(content, "utf8");
      written.push({ relativePath: displayPath, bytes });
      const line = `✓ Wrote ${displayPath} (${formatBytes(bytes)})`;
      if (!merged.json) {
        console.log(chalk.green(line));
      }
    }

    const subWritten = await writeSubagentOutputs(outDir, subagents ?? [], {
      write: merged.writeSubagents,
      cursor: merged.cursorSubagents,
    });
    for (const r of subWritten) {
      written.push({ relativePath: r.relativePath, bytes: r.bytes });
    }
    if (!merged.json) {
      printSubagentSummary({
        subagents: subagents ?? [],
        writeSubagents: merged.writeSubagents,
        cursorSubagents: merged.cursorSubagents,
        noSubagentsLlm: merged.noSubagents,
        log: (line) => console.log(line),
      });
    }

    const elapsedSec = Math.round((Date.now() - started) / 1000);
    const usedUsd = (cost.lowUsd + cost.highUsd) / 2;

    if (merged.json) {
      const sa = subagents ?? [];
      const subagentsSummary = {
        count: sa.length,
        wroteClaudeAgentFiles: merged.writeSubagents && sa.length > 0,
        wroteAgentsJson: merged.writeSubagents,
        cursor: merged.writeSubagents && sa.length > 0
          ? merged.cursorSubagents
            ? "written"
            : "skipped"
          : "skipped",
      };
      console.log(
        JSON.stringify(
          {
            ok: true,
            target: target.kind === "local" ? target.absolutePath : target.url,
            outputDir: outDir,
            formats,
            files: written,
            taskPatterns: taskPatterns ?? [],
            subagents: sa,
            subagentsSummary,
            durationSeconds: elapsedSec,
            estimatedCostUsd: Math.round(usedUsd * 100) / 100,
            provider: merged.provider,
            model: llm.modelId,
            claudeScope: merged.claudeScope,
          },
          null,
          2,
        ),
      );
    } else if (!merged.quiet) {
      console.log("");
      console.log(
        chalk.cyan(`✨ Done in ${elapsedSec} seconds. ~$${usedUsd.toFixed(2)} used.`),
      );
      console.log("");
      console.log(
        chalk.dim("Next: drop these files in your repo and your AI assistant just got 10x sharper."),
      );
    }
  } catch (e) {
    spinner.stop();
    console.error(chalk.red(e instanceof Error ? e.message : String(e)));
    process.exit(2);
  }
}
