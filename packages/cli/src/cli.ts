#!/usr/bin/env node
import { Command, Option } from "commander";

import { runCompile, type CompileCliOptions } from "./commands/compile.js";
import { runFormats } from "./commands/formats.js";
import { runGenerate } from "./commands/generate.js";
import { runInit } from "./commands/init.js";
import type { GenerateCliOptions } from "./config.js";
import { CLI_VERSION } from "./version.js";

/** Allow `skillsmith --yes` by injecting the default `generate` subcommand. */
const rawArgs = process.argv.slice(2);
const first = rawArgs[0];
if (
  first &&
  first.startsWith("-") &&
  first !== "-h" &&
  first !== "--help" &&
  first !== "-V" &&
  first !== "--version"
) {
  process.argv = [process.argv[0]!, process.argv[1]!, "generate", ...rawArgs];
}

const program = new Command("skillsmith");

program
  .description(
    "Analyze a repository and write AI rule files, task subagents (Claude Code / Cursor), and agents.json — or compile an existing agents.json without re-analyzing.",
  )
  .version(CLI_VERSION)
  .addHelpText(
    "after",
    `
Examples:
  skillsmith . --yes
  skillsmith vercel/ai-chatbot --yes --cursor
  skillsmith compile --from agents.json --target claude-code
  skillsmith compile --from ./out/agents.json --target cursor -o ./out
`,
  );

program
  .command("init")
  .description("Interactive wizard: provider, API key, default formats, default output dir → ~/.skillsmith/config.json")
  .action(async () => {
    try {
      await runInit();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    }
  });

program
  .command("formats")
  .description("Print adapter IDs for -f/--formats (claude-md, cursorrules, agents-md, copilot)")
  .action(() => {
    try {
      runFormats();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    }
  });

program
  .command("compile")
  .description(
    "Read agents.json and write subagent files only (no LLM, no repo fetch). Targets: cursor → .cursor/rules/skillsmith-*.mdc; claude-code → .claude/agents/*.md",
  )
  .addOption(
    new Option("--from <path>", "path to agents.json manifest (Skillsmith v1.0)").default("agents.json"),
  )
  .addOption(
    new Option("--target <name>", "output kind")
      .choices(["cursor", "claude-code"])
      .makeOptionMandatory(),
  )
  .option(
    "-o, --output-dir <dir>",
    "directory to treat as project root for output paths (default: parent directory of --from)",
  )
  .option("--json", "emit JSON: { ok, from, outputDir, target, agentCount, files }")
  .option("-q, --quiet", "suppress progress lines (errors still print)")
  .action(async (opts: CompileCliOptions) => {
    try {
      await runCompile(process.cwd(), opts);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    }
  });

program
  .command("generate [target]", { isDefault: true })
  .description(
    "Default command: analyze a local path or GitHub repo, then write adapter files plus subagents (unless disabled). Example: skillsmith . --yes",
  )
  .option("-k, --api-key <key>", "LLM API key (BYOK); overrides env and ~/.skillsmith/config.json")
  .option("-p, --provider <name>", "anthropic | openai | ollama")
  .option(
    "-f, --formats <csv>",
    "rule file adapters: claude-md, cursorrules, agents-md, copilot (comma-separated; see: skillsmith formats)",
  )
  .option(
    "-o, --output-dir <dir>",
    "write outputs under this directory (default: repo root for local targets, cwd for GitHub URLs)",
  )
  .option("-y, --yes", "skip the cost estimate / continue prompt")
  .option("--json", "print one JSON object with files, subagents, subagentsSummary, etc.")
  .option("-q, --quiet", "less chatter (main file writes and subagent summary still print)")
  .option("--no-reduce", "skip post-extract rule reduction (things_to_avoid filter)")
  .option(
    "--no-subagents",
    "skip LLM subagent definition generation (task patterns are still detected; no new subagents for this run)",
  )
  .option(
    "--no-subagent-output",
    "skip writing subagent outputs: .claude/agents/, agents.json, and any .mdc from --cursor (default: write)",
  )
  .option(
    "--cursor",
    "when writing subagents, also emit .cursor/rules/skillsmith-*.mdc (Cursor rules; off by default)",
  )
  .option("--debug", "during rule reduction, log each removed rule and reason to stderr")
  .option(
    "--scope <mode>",
    "where claude-md goes: project → .claude/CLAUDE.md, global → ~/.claude/CLAUDE.md, local → .claude/CLAUDE.local.md",
    "project",
  )
  .action(async (target: string | undefined, options: GenerateCliOptions) => {
    try {
      await runGenerate(target, options);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    }
  });

program.showHelpAfterError();
program.configureHelp({
  subcommandTerm: (cmd) => cmd.name(),
});
await program.parseAsync(process.argv);
