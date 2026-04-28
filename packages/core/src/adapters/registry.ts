import type { Adapter } from "../types.js";
import { agentsMdAdapter } from "./agents-md.js";
import { claudeMdAdapter } from "./claude-md.js";
import { copilotAdapter } from "./copilot.js";
import { cursorrulesAdapter } from "./cursorrules.js";

export const adapters: Record<string, Adapter> = {
  [claudeMdAdapter.format]: claudeMdAdapter,
  [cursorrulesAdapter.format]: cursorrulesAdapter,
  [agentsMdAdapter.format]: agentsMdAdapter,
  [copilotAdapter.format]: copilotAdapter,
};

export const ALL_FORMATS = Object.keys(adapters);

export const adapterRegistry: Map<string, Adapter> = new Map(Object.entries(adapters));

export function listAdapterFormats(): string[] {
  return [...ALL_FORMATS];
}
