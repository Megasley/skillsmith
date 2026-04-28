import type { LLMProvider } from "../types.js";

export function tryParseJson(raw: string): unknown {
  const s = raw.trim();
  if (!s) return null;
  const unfenced = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");
  const objMatch = unfenced.match(/\{[\s\S]*\}/);
  const toParse = objMatch ? objMatch[0]! : unfenced;
  try {
    return JSON.parse(toParse) as unknown;
  } catch {
    return null;
  }
}

export async function generateJsonWithRetry(
  provider: LLMProvider,
  params: {
    system: string;
    user: string;
    temperature: number;
    maxTokens: number;
  },
): Promise<{ ok: true; data: unknown } | { ok: false; lastText: string }> {
  let r = await provider.generate({
    system: params.system,
    user: params.user,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    expectJson: true,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.text) as unknown;
  } catch {
    parsed = null;
  }
  if (parsed !== null && typeof parsed === "object") {
    return { ok: true, data: parsed };
  }
  r = await provider.generate({
    system: params.system,
    user: `Your previous response was not valid JSON. Return only a single valid JSON value, no markdown fences.\n\n---\n${r.text.slice(0, 12_000)}`,
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    expectJson: true,
  });
  try {
    parsed = JSON.parse(r.text) as unknown;
  } catch {
    parsed = tryParseJson(r.text);
  }
  if (parsed !== null && typeof parsed === "object") {
    return { ok: true, data: parsed };
  }
  return { ok: false, lastText: r.text };
}
