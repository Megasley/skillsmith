import { auth } from "@/auth";
import {
  compileAgentsJson,
  compileClaudeCodeSubagent,
  compileCursorSubagent,
  createProvider,
  estimateCost,
  fetchRepo,
  normalizeClaudeScope,
  renderFormats,
  runAgent,
  subagentFileStem,
  type AgentProgressEvent,
  type Conventions,
  type ProviderKind,
  type SubagentDefinition,
} from "@skillsmith/core";

export const runtime = "nodejs";
export const maxDuration = 300;

const OUTPUT_FORMATS = ["claude-md", "cursorrules", "agents-md", "copilot"] as const;

function normalizeProvider(p: unknown): ProviderKind {
  const s = typeof p === "string" ? p.toLowerCase().trim() : "";
  if (s === "openai" || s === "ollama" || s === "anthropic") {
    return s;
  }
  return "anthropic";
}

function parseClaudeScope(body: Record<string, unknown>) {
  return normalizeClaudeScope(typeof body.claudeScope === "string" ? body.claudeScope : undefined);
}

function parseFormats(body: Record<string, unknown>): string[] {
  const f = body.formats;
  const allowed = new Set<string>(OUTPUT_FORMATS);
  if (!Array.isArray(f)) {
    return [...OUTPUT_FORMATS];
  }
  const picked = f.filter((x): x is string => typeof x === "string" && allowed.has(x));
  return picked.length > 0 ? picked : [...OUTPUT_FORMATS];
}

function makeLlmProvider(kind: ProviderKind, apiKey: string) {
  if (kind === "anthropic" || kind === "openai") {
    const key = apiKey.trim();
    if (!key) {
      throw new Error("API key is required for the selected provider.");
    }
    return createProvider({ name: kind, apiKey: key });
  }
  return createProvider({ name: "ollama" });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body !== "object" || !("repoUrl" in body)) {
    return new Response(
      JSON.stringify({ error: "JSON body with { repoUrl, apiKey, provider?, formats? } is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const rec = body as Record<string, unknown>;
  const repoUrl = rec.repoUrl;
  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    return new Response(JSON.stringify({ error: "repoUrl must be a non-empty string." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = typeof rec.apiKey === "string" ? rec.apiKey : "";
  const providerKind = normalizeProvider(rec.provider);

  if (providerKind === "anthropic" || providerKind === "openai") {
    if (!apiKey.trim()) {
      return new Response(JSON.stringify({ error: "apiKey is required for BYOK (Anthropic / OpenAI)." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const formats = parseFormats(rec);
  const cursorSubagents =
    rec.cursorSubagents === true || rec.cursorSubagents === "true";

  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    repo = await fetchRepo(repoUrl.trim(), session.accessToken);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch repository";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let llm: ReturnType<typeof makeLlmProvider>;
  try {
    llm = makeLlmProvider(providerKind, apiKey);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid provider configuration";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const cost = estimateCost(repo, llm);
    console.info("[skillsmith] generate — estimated cost range (USD)", {
      lowUsd: cost.lowUsd,
      highUsd: cost.highUsd,
      model: cost.model,
      provider: llm.name,
    });
  } catch {
    /* non-fatal */
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentProgressEvent | { phase: "artifacts"; message: string; data: unknown }) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let conventions: Conventions | undefined;
      let subagents: SubagentDefinition[] = [];
      try {
        for await (const event of runAgent(repo, llm)) {
          send(event);
          if (event.phase === "done" && event.data && typeof event.data === "object") {
            const d = event.data as {
              conventions?: Conventions;
              subagents?: SubagentDefinition[];
            };
            if (d.conventions) {
              conventions = d.conventions;
            }
            if (Array.isArray(d.subagents)) {
              subagents = d.subagents;
            }
          }
          if (event.phase === "error") {
            controller.close();
            return;
          }
        }

        if (!conventions) {
          send({
            phase: "error",
            message: "Agent finished without conventions output.",
          });
          controller.close();
          return;
        }

        const claudeScope = parseClaudeScope(rec);
        const outputs = await renderFormats(conventions, formats, llm, { claudeScope });
        const subagentArtifacts = subagents.map((def) => {
          const stem = subagentFileStem(def.id);
          const base = {
            id: def.id,
            name: def.name,
            description: def.description,
            confidence: def.confidence,
            filename: `.claude/agents/${stem}.md`,
            content: compileClaudeCodeSubagent(def),
          };
          if (!cursorSubagents) {
            return base;
          }
          return {
            ...base,
            cursorFilename: `.cursor/rules/skillsmith-${stem}.mdc`,
            cursorContent: compileCursorSubagent(def),
          };
        });
        const agentsJsonContent = compileAgentsJson(subagents);
        send({
          phase: "artifacts",
          message: "Rendered output files.",
          data: {
            outputs,
            subagents: subagentArtifacts,
            agentsJson: { filename: "agents.json", content: agentsJsonContent },
            cursorSubagents,
          },
        });
      } catch (e) {
        const err: AgentProgressEvent = {
          phase: "error",
          message: e instanceof Error ? e.message : "Agent failed",
        };
        send(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
