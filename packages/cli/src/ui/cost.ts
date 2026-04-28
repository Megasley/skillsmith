import chalk from "chalk";

import type { ProviderKind } from "@skillsmith/core";

export type CostPreviewInput = {
  targetDisplay: string;
  fileCount: number;
  provider: ProviderKind;
  model: string;
  formatLabels: string[];
  lowUsd: number;
  highUsd: number;
};

export function formatCostPreviewLines(input: CostPreviewInput): string[] {
  const fmt = input.formatLabels.join(", ");
  return [
    "",
    chalk.cyan("📊 Skillsmith analysis"),
    chalk.dim("─────────────────────────────"),
    `${chalk.dim("Target:")}      ${input.targetDisplay} (${input.fileCount} files)`,
    `${chalk.dim("Provider:")}    ${input.provider} (${chalk.dim(input.model)})`,
    `${chalk.dim("Formats:")}     ${fmt}`,
    `${chalk.dim("Est. cost:")}   $${input.lowUsd.toFixed(2)} – $${input.highUsd.toFixed(2)}`,
    chalk.dim("─────────────────────────────"),
    "",
  ];
}

export function printCostPreview(input: CostPreviewInput, log: (line: string) => void): void {
  for (const line of formatCostPreviewLines(input)) {
    if (line === "") {
      log("");
    } else {
      log(line);
    }
  }
}
