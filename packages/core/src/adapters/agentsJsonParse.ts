import type { SubagentDefinition } from "../types.js";

export class AgentsJsonParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentsJsonParseError";
  }
}

function isConfidence(s: unknown): s is SubagentDefinition["confidence"] {
  return s === "high" || s === "medium" || s === "low";
}

function parseAgentEntry(raw: unknown, index: number): SubagentDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AgentsJsonParseError(`agents[${index}] must be an object`);
  }
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const description = typeof o.description === "string" ? o.description.trim() : "";
  const systemPrompt = typeof o.systemPrompt === "string" ? o.systemPrompt.trim() : "";

  if (!id) {
    throw new AgentsJsonParseError(`agents[${index}].id is required`);
  }
  if (!name || !description || !systemPrompt) {
    throw new AgentsJsonParseError(
      `agents[${index}]: "name", "description", and "systemPrompt" must be non-empty strings`,
    );
  }

  let tools: string[] = [];
  if (o.tools !== undefined) {
    if (!Array.isArray(o.tools)) {
      throw new AgentsJsonParseError(`agents[${index}].tools must be an array of strings`);
    }
    tools = o.tools.map((t, j) => {
      if (typeof t !== "string" || !t.trim()) {
        throw new AgentsJsonParseError(`agents[${index}].tools[${j}] must be a non-empty string`);
      }
      return t.trim();
    });
  }

  const model = typeof o.model === "string" && o.model.trim() ? o.model.trim() : "haiku";

  const repoScoped = typeof o.repoScoped === "boolean" ? o.repoScoped : true;

  let domainHints: string[] = [];
  if (o.domainHints !== undefined) {
    if (!Array.isArray(o.domainHints)) {
      throw new AgentsJsonParseError(`agents[${index}].domainHints must be an array of strings`);
    }
    domainHints = o.domainHints.map((h, j) => {
      if (typeof h !== "string" || !h.trim()) {
        throw new AgentsJsonParseError(`agents[${index}].domainHints[${j}] must be a non-empty string`);
      }
      return h.trim();
    });
  }

  const confidence: SubagentDefinition["confidence"] = isConfidence(o.confidence)
    ? o.confidence
    : "medium";

  return {
    id,
    name,
    description,
    tools,
    model,
    systemPrompt,
    repoScoped,
    confidence,
    domainHints,
  };
}

/**
 * Parse `agents.json` text into {@link SubagentDefinition} entries for compilation.
 * Expects the Skillsmith manifest shape (see docs/agents-schema.md).
 */
export function parseAgentsJsonFromText(text: string): SubagentDefinition[] {
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new AgentsJsonParseError(`Invalid JSON: ${cause}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AgentsJsonParseError("Root must be a JSON object");
  }

  const root = data as Record<string, unknown>;
  if (root.version !== undefined && root.version !== "1.0") {
    throw new AgentsJsonParseError(
      `Unsupported agents.json version: ${String(root.version)} (expected "1.0")`,
    );
  }

  if (!Array.isArray(root.agents)) {
    throw new AgentsJsonParseError('Missing or invalid "agents" array');
  }

  return root.agents.map((a, i) => parseAgentEntry(a, i));
}
