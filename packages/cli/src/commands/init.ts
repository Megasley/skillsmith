import fs from "node:fs";

import chalk from "chalk";
import inquirer from "inquirer";

import { CONFIG_DIR, CONFIG_PATH, normalizeProvider, type FileConfig } from "../config.js";
import { ALL_FORMAT_IDS, FORMAT_META, type FormatId } from "../util.js";

export async function runInit(): Promise<void> {
  console.log(chalk.cyan("Skillsmith setup — we'll save ~/.skillsmith/config.json\n"));

  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      type: "list",
      name: "provider",
      message: "Default LLM provider",
      choices: [
        { name: "Anthropic (Claude)", value: "anthropic" },
        { name: "OpenAI", value: "openai" },
        { name: "Ollama (local)", value: "ollama" },
      ],
      default: "anthropic",
    },
  ]);

  const kind = normalizeProvider(provider);

  let apiKey = "";
  if (kind !== "ollama") {
    const { key } = await inquirer.prompt<{ key: string }>([
      {
        type: "password",
        name: "key",
        message: "API key",
        mask: "*",
      },
    ]);
    apiKey = key.trim();
  }

  const { formats } = await inquirer.prompt<{ formats: string[] }>([
    {
      type: "checkbox",
      name: "formats",
      message: "Default output formats",
      choices: ALL_FORMAT_IDS.map((id) => ({
        name: `${FORMAT_META[id].label} (${id})`,
        value: id,
        checked: true,
      })),
    },
  ]);

  const { outputDir } = await inquirer.prompt<{ outputDir: string }>([
    {
      type: "input",
      name: "outputDir",
      message: "Default output directory (relative to cwd)",
      default: ".",
    },
  ]);

  const cfg: FileConfig = {
    provider: kind,
    formats: (formats.length ? formats : [...ALL_FORMAT_IDS]) as string[],
    outputDir: outputDir.trim() || ".",
  };
  if (apiKey) {
    cfg.apiKey = apiKey;
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best effort */
  }

  console.log("");
  console.log(chalk.green(`✓ Config saved to ${CONFIG_PATH}`));
}
