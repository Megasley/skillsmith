import { describe, expect, it } from "vitest";

import { detectTaskPatterns } from "../../agent/detectTaskPatterns.js";
import type { FetchedRepo } from "../../types.js";

function repo(partial: Partial<FetchedRepo> & Pick<FetchedRepo, "tree" | "files">): FetchedRepo {
  return {
    source: "local",
    identifier: "test",
    truncated: false,
    ...partial,
  };
}

describe("detectTaskPatterns", () => {
  it("always includes code-reviewer", () => {
    const r = repo({ tree: ["README.md"], files: {} });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).toContain("code-reviewer");
    expect(p.find((x) => x.id === "code-reviewer")?.confidence).toBe("high");
  });

  it("detects test-writer from vitest in package.json", () => {
    const r = repo({
      tree: ["package.json"],
      files: {
        "package.json": JSON.stringify({ devDependencies: { vitest: "^1.0.0" } }),
      },
    });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).toContain("test-writer");
  });

  it("detects migration-planner from Prisma schema", () => {
    const r = repo({
      tree: ["prisma/schema.prisma"],
      files: { "prisma/schema.prisma": "datasource db {}" },
    });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).toContain("migration-planner");
  });

  it("detects api-documenter from Next app route", () => {
    const r = repo({
      tree: ["app/api/hello/route.ts"],
      files: { "app/api/hello/route.ts": "export function GET() {}" },
    });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).toContain("api-documenter");
  });

  it("detects dependency-auditor from manifests", () => {
    const r = repo({
      tree: ["package.json", "Cargo.toml"],
      files: {
        "package.json": "{}",
        "Cargo.toml": "[package]\nname = x",
      },
    });
    const p = detectTaskPatterns(r);
    const d = p.find((x) => x.id === "dependency-auditor");
    expect(d).toBeDefined();
    expect(d!.detectedFrom).toContain("package.json");
    expect(d!.detectedFrom).toContain("Cargo.toml");
  });

  it("adds refactor-assistant when tree has >50 paths", () => {
    const tree = Array.from({ length: 51 }, (_, i) => `src/f${i}.ts`);
    const files = Object.fromEntries(tree.map((p) => [p, ""]));
    const r = repo({ tree, files });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).toContain("refactor-assistant");
    expect(p.find((x) => x.id === "refactor-assistant")?.confidence).toBe("medium");
  });

  it("omits refactor-assistant when tree has ≤50 paths", () => {
    const tree = Array.from({ length: 50 }, (_, i) => `src/f${i}.ts`);
    const files = Object.fromEntries(tree.map((p) => [p, ""]));
    const r = repo({ tree, files });
    const p = detectTaskPatterns(r);
    expect(p.map((x) => x.id)).not.toContain("refactor-assistant");
  });
});
