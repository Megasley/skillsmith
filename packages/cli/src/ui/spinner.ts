import chalk from "chalk";
import ora, { type Ora } from "ora";

type PhaseState = "pending" | "running" | "done";

const PHASE_ORDER = ["inventory", "sample", "extract", "synthesize"] as const;
type PhaseKey = (typeof PHASE_ORDER)[number];

const LABELS: Record<PhaseKey, string> = {
  inventory: "Inventory",
  sample: "Sample",
  extract: "Extract",
  synthesize: "Synthesize",
};

function icon(s: PhaseState): string {
  if (s === "done") return chalk.green("✓");
  if (s === "running") return chalk.cyan("◆");
  return chalk.dim("○");
}

function renderLines(state: Record<PhaseKey, PhaseState>): string {
  return PHASE_ORDER.map((key) => {
    const st = state[key];
    return `  ${icon(st)} ${LABELS[key]}`;
  }).join("\n");
}

export class PhaseSpinner {
  private spinner: Ora;
  private state: Record<PhaseKey, PhaseState>;

  constructor(private quiet: boolean) {
    this.state = {
      inventory: "pending",
      sample: "pending",
      extract: "pending",
      synthesize: "pending",
    };
    this.spinner = ora({ text: renderLines(this.state), spinner: "dots" });
  }

  start(): void {
    if (this.quiet) return;
    this.spinner.start();
  }

  private refresh(): void {
    if (this.quiet) return;
    this.spinner.text = renderLines(this.state);
  }

  /** Map core agent phases to spinner state. */
  onAgentPhase(phase: string): void {
    if (phase === "inventory") {
      this.state.inventory = "running";
    } else if (phase === "sample") {
      this.state.inventory = "done";
      this.state.sample = "running";
    } else if (phase === "extract") {
      this.state.inventory = "done";
      this.state.sample = "done";
      this.state.extract = "running";
    } else if (phase === "reduce" || phase === "subagents") {
      this.state.inventory = "done";
      this.state.sample = "done";
      this.state.extract = "done";
      this.state.synthesize = "running";
    } else if (phase === "done") {
      this.state.inventory = "done";
      this.state.sample = "done";
      this.state.extract = "done";
    }
    this.refresh();
  }

  startSynthesize(): void {
    this.state.inventory = "done";
    this.state.sample = "done";
    this.state.extract = "done";
    this.state.synthesize = "running";
    this.refresh();
  }

  succeed(finalMessage?: string): void {
    if (this.quiet) return;
    this.state.inventory = "done";
    this.state.sample = "done";
    this.state.extract = "done";
    this.state.synthesize = "done";
    this.spinner.text = renderLines(this.state);
    this.spinner.succeed(finalMessage ?? chalk.green("All phases complete"));
  }

  fail(message: string): void {
    if (this.quiet) return;
    this.spinner.fail(message);
  }

  stop(): void {
    if (this.quiet) return;
    this.spinner.stop();
  }
}
