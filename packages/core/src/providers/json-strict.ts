/**
 * Strict JSON parse for model output: trim, strip a single markdown fence if present, then `JSON.parse`.
 * Returns canonical JSON string via `JSON.stringify` so downstream `JSON.parse` is stable.
 */
export function strictJsonTextFromModel(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const parsed: unknown = JSON.parse(s);
  return JSON.stringify(parsed);
}
