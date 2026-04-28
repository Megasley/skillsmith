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
  .description("Generate AI rules files from a local folder or GitHub repository")
  .version(CLI_VERSION);

program.command("init").description("Interactive setup (~/.skillsmith/config.json)").action(async () => {
  try {
    await runInit();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
});

program.command("formats").description("List supported output formats").action(() => {
  try {
    runFormats();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  }
});

program
  .command("compile")
  .description("Compile agents.json to Cursor or Claude Code subagent files (no repository analysis)")
  .addOption(new Option("--from <path>", "path to agents.json").default("agents.json"))
  .addOption(
    new Option("--target <name>", "output format")
      .choices(["cursor", "claude-code"])
      .makeOptionMandatory(),
  )
  .option(
    "-o, --output-dir <dir>",
    "project root to write under (default: directory containing --from)",
  )
  .option("--json", "print machine-readable JSON to stdout")
  .option("-q, --quiet", "minimal stdout")
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
  .description("Analyze repository and write rules (default). Example: skillsmith .  or  skillsmith -y .")
  .option("-k, --api-key <key>", "LLM API key (BYOK); overrides env and config")
  .option("-p, --provider <name>", "anthropic | openai | ollama")
  .option("-f, --formats <csv>", "comma-separated: claude-md,cursorrules,agents-md,copilot")
  .option("-o, --output-dir <dir>", "write files here (default: project root for local, cwd for remote)")
  .option("-y, --yes", "skip confirmation prompt")
  .option("--json", "print machine-readable JSON to stdout")
  .option("-q, --quiet", "minimal output (still prints file writes)")
  .option("--no-reduce", "skip post-extract rule reduction (things_to_avoid filter)")
  .option("--no-subagents", "skip LLM subagent definition generation (task patterns still detected)")
  .option(
    "--no-subagent-output",
    "skip writing compiled subagents (.claude/agents, agents.json, optional Cursor); default is to write them",
  )
  .option("--cursor", "with compiled subagents: also write .cursor/rules/skillsmith-*.mdc (default: false)")
  .option("--debug", "log removed rules and reasons to stderr during rule reduction")
  .option(
    "--scope <mode>",
    "claude-md destination: project (.claude/CLAUDE.md), global (~/.claude/CLAUDE.md), or local (.claude/CLAUDE.local.md)",
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
