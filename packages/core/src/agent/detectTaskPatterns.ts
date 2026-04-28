import type { FetchedRepo, TaskPattern } from "../types.js";

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function treePaths(repo: FetchedRepo): string[] {
  return repo.tree.map(norm);
}

function hasPath(tree: string[], re: RegExp): boolean {
  return tree.some((p) => re.test(p));
}

function readText(files: Record<string, string>, path: string): string | undefined {
  const n = norm(path);
  const hit =
    files[path] ??
    files[n] ??
    Object.entries(files).find(([k]) => norm(k) === n)?.[1];
  return hit;
}

function parsePackageJson(files: Record<string, string>): Record<string, unknown> | null {
  const raw = readText(files, "package.json");
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pkgDepNames(pkg: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
    const block = pkg[key];
    if (block && typeof block === "object") {
      out.push(...Object.keys(block as Record<string, unknown>));
    }
  }
  return out;
}

function jsonStringifyContains(raw: string, sub: string): boolean {
  return raw.toLowerCase().includes(sub.toLowerCase());
}

/** Heuristic task presets derived from repo layout and manifests (no LLM). */
export function detectTaskPatterns(repo: FetchedRepo): TaskPattern[] {
  const tree = treePaths(repo);
  const files = repo.files;
  const patterns: TaskPattern[] = [];

  patterns.push({
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Review diffs for bugs, style, and consistency with project conventions.",
    confidence: "high",
    detectedFrom: ["skillsmith:always"],
  });

  const testEvidence: string[] = [];
  if (
    hasPath(tree, /(^|\/)jest\.config\.(js|cjs|mjs|ts|mts|cts|json)$/) ||
    hasPath(tree, /(^|\/)jest\.config\.base\.(js|cjs|mjs|ts)$/)
  ) {
    testEvidence.push("jest.config.*");
  }
  const pkg = parsePackageJson(files);
  if (pkg) {
    const raw = readText(files, "package.json") ?? "";
    const deps = pkgDepNames(pkg);
    if (deps.includes("jest") || jsonStringifyContains(raw, '"jest"')) {
      testEvidence.push("package.json (jest)");
    }
    if (deps.includes("vitest") || jsonStringifyContains(raw, '"vitest"')) {
      testEvidence.push("package.json (vitest)");
    }
  }
  if (hasPath(tree, /(^|\/)vitest\.config\.(ts|js|mts|cts|cjs|mjs)$/) || hasPath(tree, /(^|\/)vite\.config\.(ts|js|mts|cts)$/)) {
    testEvidence.push("vitest/vite config");
  }
  if (
    hasPath(tree, /(^|\/)pytest\.ini$/) ||
    hasPath(tree, /(^|\/)pyproject\.toml$/) ||
    hasPath(tree, /(^|\/)tox\.ini$/) ||
    hasPath(tree, /(^|\/)conftest\.py$/)
  ) {
    testEvidence.push("pytest/pyproject/tox/conftest");
  }
  if (hasPath(tree, /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i) || hasPath(tree, /\/__tests__\//)) {
    testEvidence.push("test/spec files or __tests__");
  }
  if (hasPath(tree, /(^|\/)Cargo\.toml$/) && hasPath(tree, /(^|\/)tests\//)) {
    testEvidence.push("Rust Cargo.toml + tests/");
  }

  const uniqTest = [...new Set(testEvidence)];
  if (uniqTest.length > 0) {
    patterns.push({
      id: "test-writer",
      name: "Test Writer",
      description: "Add or extend tests using the repo’s existing runner and layout.",
      confidence: uniqTest.some((e) => e.includes("package.json") || e.includes("jest.config") || e.includes("vitest")) ? "high" : "medium",
      detectedFrom: uniqTest,
    });
  }

  const migrationEvidence: string[] = [];
  if (hasPath(tree, /\.prisma$/i) || hasPath(tree, /(^|\/)prisma\/schema\.prisma$/)) {
    migrationEvidence.push("Prisma schema");
  }
  if (hasPath(tree, /(^|\/)drizzle\.config\.(ts|js)$/) || hasPath(tree, /(^|\/)drizzle\//)) {
    migrationEvidence.push("Drizzle config or drizzle/");
  }
  if (hasPath(tree, /(^|\/)alembic\.ini$/) || hasPath(tree, /(^|\/)alembic\/(env\.py|versions\/)/)) {
    migrationEvidence.push("Alembic");
  }
  if (hasPath(tree, /(^|\/)diesel\.toml$/)) {
    migrationEvidence.push("diesel.toml");
  }
  if (migrationEvidence.length > 0) {
    patterns.push({
      id: "migration-planner",
      name: "Migration Planner",
      description: "Plan safe schema and data migrations aligned with existing migration tooling.",
      confidence: "high",
      detectedFrom: migrationEvidence,
    });
  }

  const apiEvidence: string[] = [];
  if (
    hasPath(tree, /(^|\/)app\/api\/[^/]+\/route\.(ts|tsx|js|jsx)$/) ||
    hasPath(tree, /(^|\/)src\/app\/api\/[^/]+\/route\.(ts|tsx|js|jsx)$/)
  ) {
    apiEvidence.push("Next.js App Router app/api/.../route");
  }
  if (hasPath(tree, /(^|\/)pages\/api\//)) {
    apiEvidence.push("Next.js pages/api/");
  }
  if (pkg?.dependencies || pkg?.devDependencies) {
    const deps = pkgDepNames(pkg);
    if (deps.includes("express")) {
      apiEvidence.push("package.json (express)");
    }
    if (deps.includes("fastify") || deps.includes("@nestjs/core")) {
      apiEvidence.push(`package.json (${deps.includes("fastify") ? "fastify" : "@nestjs/core"})`);
    }
  }
  for (const [path, content] of Object.entries(files)) {
    const p = norm(path);
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p)) continue;
    if (content.includes("express.Router") || content.includes('require("express")') || content.includes("from \"express\"") || content.includes("from 'express'")) {
      apiEvidence.push(path);
      break;
    }
  }
  for (const [path, content] of Object.entries(files)) {
    if (!norm(path).endsWith(".py")) continue;
    if (/from\s+fastapi\s+import|import\s+fastapi|FastAPI\s*\(/.test(content)) {
      apiEvidence.push(path);
      break;
    }
  }

  const uniqApi = [...new Set(apiEvidence)];
  if (uniqApi.length > 0) {
    patterns.push({
      id: "api-documenter",
      name: "API Documenter",
      description: "Document HTTP routes, request/response shapes, and integration points.",
      confidence: uniqApi.some((e) => e.includes("app/api") || e.includes("pages/api") || e.endsWith(".py")) ? "high" : "medium",
      detectedFrom: uniqApi.slice(0, 12),
    });
  }

  const depEvidence: string[] = [];
  if (hasPath(tree, /(^|\/)package\.json$/)) depEvidence.push("package.json");
  if (hasPath(tree, /(^|\/)Cargo\.toml$/)) depEvidence.push("Cargo.toml");
  if (hasPath(tree, /(^|\/)requirements\.txt$/)) depEvidence.push("requirements.txt");
  if (hasPath(tree, /(^|\/)pyproject\.toml$/)) depEvidence.push("pyproject.toml");
  if (depEvidence.length > 0) {
    patterns.push({
      id: "dependency-auditor",
      name: "Dependency Auditor",
      description: "Audit dependencies for upgrades, vulnerabilities, and license alignment.",
      confidence: "high",
      detectedFrom: [...new Set(depEvidence)],
    });
  }

  if (tree.length > 50) {
    patterns.push({
      id: "refactor-assistant",
      name: "Refactor Assistant",
      description: "Suggest safe refactors and incremental cleanup in larger codebases.",
      confidence: "medium",
      detectedFrom: [`repository tree: ${tree.length} paths`],
    });
  }

  return patterns;
}
