import chalk from "chalk";

import { FORMAT_META, type FormatId } from "../util.js";

export function runFormats(): void {
  const ids = Object.keys(FORMAT_META) as FormatId[];
  for (const id of ids) {
    const m = FORMAT_META[id];
    console.log(
      `${chalk.cyan(m.label)} ${chalk.dim(`(${id})`)}\n` +
        `  ${chalk.dim("Tool:")} ${m.tool}\n` +
        `  ${chalk.dim("File:")} ${m.example}\n`,
    );
  }
}
