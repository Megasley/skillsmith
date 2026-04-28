/**
 * Stream /api/generate SSE from the terminal (avoids zsh quoting issues with node -e).
 *
 * Usage:
 *   export COOKIE='authjs.session-token=...'   # copy from DevTools → Application → Cookies (localhost:3000)
 *   export API_KEY='sk-ant-...'                 # BYOK — same key as in browser Settings
 *   node scripts/stream-generate.mjs https://github.com/vercel/ai-chatbot
 *
 * Optional: PROVIDER=anthropic|openai|ollama (default anthropic)
 *
 * Or: REPO_URL=... node scripts/stream-generate.mjs
 */
const base = process.env.BASE_URL ?? "http://localhost:3000";
const repoUrl = process.argv[2] ?? process.env.REPO_URL;
const cookie = process.env.COOKIE;
const apiKey = process.env.API_KEY ?? "";
const provider = process.env.PROVIDER ?? "anthropic";

if (!repoUrl) {
  console.error("Usage: COOKIE='...' API_KEY='...' node scripts/stream-generate.mjs <repoUrl>");
  process.exit(1);
}
if (!cookie) {
  console.error("Set COOKIE to your session cookie from http://localhost:3000 (DevTools → Application → Cookies).");
  process.exit(1);
}
if (provider !== "ollama" && !apiKey) {
  console.error("Set API_KEY for Anthropic/OpenAI (BYOK), or PROVIDER=ollama for local Ollama.");
  process.exit(1);
}

const res = await fetch(`${base.replace(/\/$/, "")}/api/generate`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: cookie,
  },
  body: JSON.stringify({
    repoUrl,
    provider,
    apiKey,
    formats: ["claude-md", "cursorrules", "agents-md", "copilot"],
  }),
});

if (!res.ok) {
  const text = await res.text();
  console.error(res.status, text);
  process.exit(1);
}

const reader = res.body?.getReader();
if (!reader) {
  console.error("No response body");
  process.exit(1);
}

const dec = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(dec.decode(value, { stream: true }));
}
