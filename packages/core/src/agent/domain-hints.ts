/**
 * Infer domain tags from manifest dependency names (package.json, Cargo.toml, pyproject, requirements).
 */

const DEP_RULES: Array<{ re: RegExp; tags: string[] }> = [
  {
    re: /(\/|^)lnbits|^@lnbits\/|^ldk$|^bdk$|rust-lightning|lightning-devkit|bitcoinjs|bitcoind|electrs|@bitcoinerlab/i,
    tags: ["bitcoin", "lightning"],
  },
  { re: /^stripe$|@stripe\/|blink-pay|blinkpay|paypal|braintree|@paypal\/|squareup|@square\//i, tags: ["payments"] },
  {
    re: /anthropic|@anthropic-ai\/|openai|@openai\/|@ai-sdk\/|^ai$|langchain|@langchain\/|ollama|transformers|tiktoken|vertexai|google-generativeai/i,
    tags: ["ai"],
  },
  {
    re: /next-auth|@auth\/|clerk|@clerk\/|passport|jsonwebtoken|^jose$|@supabase\/auth|auth0|fastapi-users|pyjwt|python-jose|workos/i,
    tags: ["auth"],
  },
  {
    re: /prisma|@prisma\/|drizzle-orm|drizzle-kit|^mongoose$|sequelize|typeorm|sqlalchemy|diesel|rusqlite|^sqlx|redis|ioredis|@planetscale|@libsql|kysely/i,
    tags: ["database"],
  },
];

export function tagsForDependencyName(dep: string): string[] {
  const d = dep.trim().toLowerCase();
  if (!d) return [];
  const out = new Set<string>();
  for (const { re, tags } of DEP_RULES) {
    if (re.test(d)) {
      for (const t of tags) out.add(t);
    }
  }
  return [...out];
}

function collectNpmDependencyNames(files: Record<string, string>): string[] {
  const raw = files["package.json"];
  if (!raw) return [];
  let pkg: unknown;
  try {
    pkg = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!pkg || typeof pkg !== "object") return [];
  const o = pkg as Record<string, unknown>;
  const names: string[] = [];
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
    const block = o[key];
    if (block && typeof block === "object") {
      names.push(...Object.keys(block as Record<string, unknown>));
    }
  }
  return names;
}

function collectCargoDependencyNames(files: Record<string, string>): string[] {
  const raw = files["Cargo.toml"] ?? files["cargo.toml"];
  if (!raw) return [];
  const names: string[] = [];
  const sectionRe = /^\[(dependencies|dev-dependencies|build-dependencies)\]\s*$/i;
  let inSection = false;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (sectionRe.test(t)) {
      inSection = true;
      continue;
    }
    if (t.startsWith("[") && t.endsWith("]")) {
      inSection = false;
      continue;
    }
    if (!inSection || !t || t.startsWith("#")) continue;
    const m = t.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (m) names.push(m[1]!);
  }
  return names;
}

function collectRequirementsNames(files: Record<string, string>): string[] {
  const raw = files["requirements.txt"] ?? files["requirements-dev.txt"];
  if (!raw) return [];
  const names: string[] = [];
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const m = line.match(/^([a-zA-Z0-9][a-zA-Z0-9._-]*)/);
    if (m) names.push(m[1]!.replace(/_/g, "-"));
  }
  return names;
}

function collectPyProjectNames(files: Record<string, string>): string[] {
  const raw = files["pyproject.toml"];
  if (!raw) return [];
  const names: string[] = [];
  const inDeps =
    /\[project\](?:.|\n)*?dependencies\s*=\s*\[([\s\S]*?)\]/i.exec(raw)?.[1] ??
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:^\[|\Z)/im.exec(raw)?.[1];
  if (inDeps) {
    const quoted = inDeps.matchAll(/["']([a-zA-Z0-9][a-zA-Z0-9._-]*)["']/g);
    for (const m of quoted) {
      names.push(m[1]!.replace(/_/g, "-"));
    }
    const poetryStyle = inDeps.matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*=/gm);
    for (const m of poetryStyle) {
      if (m[1]!.toLowerCase() !== "python") names.push(m[1]!.replace(/_/g, "-"));
    }
  }
  const lower = raw.toLowerCase();
  const known = [
    "stripe",
    "anthropic",
    "openai",
    "prisma",
    "drizzle-orm",
    "fastapi",
    "django",
    "pyjwt",
    "sqlalchemy",
  ];
  for (const k of known) {
    if (lower.includes(k)) names.push(k);
  }
  return names;
}

/**
 * Derive sorted unique domain tags from dependency manifests in the repo snapshot.
 */
export function deriveDomainHints(files: Record<string, string>): string[] {
  const depNames = [
    ...collectNpmDependencyNames(files),
    ...collectCargoDependencyNames(files),
    ...collectRequirementsNames(files),
    ...collectPyProjectNames(files),
  ];
  const tags = new Set<string>();
  for (const dep of depNames) {
    for (const t of tagsForDependencyName(dep)) {
      tags.add(t);
    }
  }
  return [...tags].sort();
}

/**
 * Build the domain-hint section for subagent LLM prompts (explicit bullets per user spec).
 */
export function formatDomainHintPromptSection(hints: string[]): string {
  if (hints.length === 0) {
    return "No domain hints were detected from package.json, Cargo.toml, pyproject.toml, or requirements.txt. Skip domain-specific bullets below.";
  }
  const lines: string[] = [];
  const have = new Set(hints);
  if (have.has("bitcoin") || have.has("lightning")) {
    lines.push(
      "- **bitcoin / lightning**: Check for payment security, HTLC handling, and invoice validation.",
    );
  }
  if (have.has("ai")) {
    lines.push(
      "- **ai**: Check for prompt injection, token budget issues, and API error handling.",
    );
  }
  if (have.has("payments")) {
    lines.push(
      "- **payments**: Check for idempotency, webhook validation, and failure handling.",
    );
  }
  if (have.has("auth")) {
    lines.push(
      "- **auth**: Check for JWT expiry, session management, and privilege escalation.",
    );
  }
  if (have.has("database")) {
    lines.push(
      "- **database**: Check for SQL injection risks, migration safety, and connection handling.",
    );
  }
  return lines.join("\n");
}
