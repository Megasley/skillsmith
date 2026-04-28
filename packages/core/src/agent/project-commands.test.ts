import { describe, expect, it } from "vitest";

import { deriveProjectCommands, formatManifestExcerptsForExtract } from "./project-commands.js";
import type { Inventory } from "../types.js";

const baseInv = (): Inventory => ({
  primary_language: "TypeScript",
  framework: null,
  key_libraries: [],
  project_type: "web-app",
  testing_framework: "Vitest",
  package_manager: "pnpm",
});

describe("deriveProjectCommands", () => {
  it("maps package.json scripts with pnpm", () => {
    const files = {
      "package.json": JSON.stringify({
        scripts: {
          dev: "next dev",
          build: "next build",
          test: "vitest run",
          lint: "eslint .",
          "lint:fix": "eslint . --fix",
          typecheck: "tsc --noEmit",
          format: "prettier --write .",
        },
      }),
      "pnpm-lock.yaml": "",
    };
    const c = deriveProjectCommands(files, baseInv());
    expect(c.install).toBe("pnpm install");
    expect(c.dev).toBe("pnpm dev");
    expect(c.build).toBe("pnpm build");
    expect(c.test_all).toBe("pnpm test");
    expect(c.test_single).toBe("pnpm test -- <path>");
    expect(c.lint).toBe("pnpm lint");
    expect(c.lint_fix).toBe("pnpm lint:fix");
    expect(c.typecheck).toBe("pnpm typecheck");
    expect(c.format).toBe("pnpm format");
  });

  it("uses pytest when pyproject and pytest inventory with uv", () => {
    const files = {
      "pyproject.toml": "[project]\nname = \"x\"\n[tool.taskipy.tasks]\n",
      "uv.lock": "",
    };
    const inv = { ...baseInv(), primary_language: "Python", testing_framework: "pytest", package_manager: "uv" };
    const c = deriveProjectCommands(files, inv);
    expect(c.install).toBe("uv sync");
    expect(c.test_all).toBe("uv run pytest");
    expect(c.test_single).toBe("uv run pytest <path>");
  });

  it("includes manifest excerpts when package.json exists", () => {
    const s = formatManifestExcerptsForExtract({
      "package.json": '{"scripts":{"test":"vitest"}}',
    });
    expect(s).toContain("Manifest excerpts");
    expect(s).toContain("package.json");
    expect(s).toContain("vitest");
  });
});
