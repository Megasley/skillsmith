import type { Inventory, ProjectCommands } from "../types.js";

const empty = (): ProjectCommands => ({
  install: null,
  dev: null,
  build: null,
  test_all: null,
  test_single: null,
  lint: null,
  lint_fix: null,
  typecheck: null,
  format: null,
});

function resolveNodePm(files: Record<string, string>, inv: Inventory): "npm" | "pnpm" | "yarn" | "bun" {
  const hint = (inv.package_manager ?? "").toLowerCase();
  if (hint.includes("pnpm")) return "pnpm";
  if (hint.includes("yarn")) return "yarn";
  if (hint.includes("bun")) return "bun";
  if ("pnpm-lock.yaml" in files || "pnpm-workspace.yaml" in files) return "pnpm";
  if ("yarn.lock" in files) return "yarn";
  if ("bun.lock" in files || "bun.lockb" in files) return "bun";
  return "npm";
}

function scriptCommand(pm: "npm" | "pnpm" | "yarn" | "bun", scriptName: string): string {
  switch (pm) {
    case "npm":
      return `npm run ${scriptName}`;
    case "pnpm":
      return `pnpm ${scriptName}`;
    case "yarn":
      return `yarn ${scriptName}`;
    case "bun":
      return `bun run ${scriptName}`;
    default:
      return `npm run ${scriptName}`;
  }
}

function nodeInstall(pm: "npm" | "pnpm" | "yarn" | "bun"): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

function firstScript(
  scripts: Record<string, string>,
  names: string[],
): string | null {
  for (const n of names) {
    if (typeof scripts[n] === "string" && scripts[n]!.trim()) return n;
  }
  return null;
}

function parsePackageJson(text: string): Record<string, string> | null {
  try {
    const j = JSON.parse(text) as { scripts?: unknown };
    if (!j.scripts || typeof j.scripts !== "object" || Array.isArray(j.scripts)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j.scripts)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function makefileTargets(makefile: string): Set<string> {
  const s = new Set<string>();
  for (const line of makefile.split("\n")) {
    if (line.startsWith("\t") || line.startsWith(" ") || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z0-9_.@%-]+)\s*::?\s*(#.*)?$/.exec(line);
    if (m && !m[1]!.includes("%")) s.add(m[1]!);
  }
  return s;
}

function pythonInstallCmd(files: Record<string, string>): string | null {
  if ("uv.lock" in files) return "uv sync";
  if ("poetry.lock" in files) return "poetry install";
  if ("pdm.lock" in files) return "pdm install";
  if ("Pipfile" in files) return "pipenv install";
  if ("requirements.txt" in files) return "pip install -r requirements.txt";
  return null;
}

function pythonTestCmd(files: Record<string, string>, inv: Inventory): string | null {
  const tf = (inv.testing_framework ?? "").toLowerCase();
  const runPrefix =
    "uv.lock" in files ? "uv run " : "poetry.lock" in files ? "poetry run " : "pdm.lock" in files ? "pdm run " : "";
  if (tf.includes("pytest") || tf.includes("tox")) {
    return runPrefix ? `${runPrefix}pytest` : "pytest";
  }
  return null;
}

/** Parse [tool.taskipy.tasks] task names from pyproject (best-effort, no full TOML). */
function taskipyTaskCommands(pyproject: string): Record<string, string> {
  const out: Record<string, string> = {};
  const idx = pyproject.indexOf("[tool.taskipy.tasks]");
  if (idx === -1) return out;
  const rest = pyproject.slice(idx);
  const end = rest.indexOf("\n[");
  const section = end === -1 ? rest : rest.slice(0, end);
  for (const line of section.split("\n")) {
    const m = /^\s*([A-Za-z0-9_-]+)\s*=\s*["']([^"']*)["']\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

function fromPackageJson(scripts: Record<string, string>, pm: "npm" | "pnpm" | "yarn" | "bun"): ProjectCommands {
  const c = empty();
  c.install = nodeInstall(pm);

  const devN = firstScript(scripts, ["dev", "start", "serve"]);
  if (devN) c.dev = scriptCommand(pm, devN);

  if (firstScript(scripts, ["build"])) c.build = scriptCommand(pm, "build");

  if (firstScript(scripts, ["test"])) {
    c.test_all = scriptCommand(pm, "test");
    c.test_single = `${scriptCommand(pm, "test")} -- <path>`;
  }

  const lintN = firstScript(scripts, ["lint", "eslint"]);
  if (lintN) c.lint = scriptCommand(pm, lintN);

  const lintFixN = firstScript(scripts, ["lint:fix", "lint-fix", "eslint:fix"]);
  if (lintFixN) c.lint_fix = scriptCommand(pm, lintFixN);

  const typeN = firstScript(scripts, ["typecheck", "check-types", "tsc"]);
  if (typeN) c.typecheck = scriptCommand(pm, typeN);

  const fmtN = firstScript(scripts, ["format", "prettier"]);
  if (fmtN) c.format = scriptCommand(pm, fmtN);

  return c;
}

function fromCargoToml(_text: string): ProjectCommands {
  const c = empty();
  c.build = "cargo build";
  c.test_all = "cargo test";
  c.test_single = "cargo test <name>";
  c.format = "cargo fmt";
  c.lint = "cargo clippy";
  return c;
}

function fromMakefile(makefile: string): ProjectCommands {
  const t = makefileTargets(makefile);
  const c = empty();
  if (t.has("install")) c.install = "make install";
  if (t.has("dev") || t.has("run") || t.has("serve")) {
    c.dev = t.has("dev") ? "make dev" : t.has("serve") ? "make serve" : "make run";
  }
  if (t.has("build")) c.build = "make build";
  if (t.has("test")) {
    c.test_all = "make test";
    c.test_single = "make test";
  }
  if (t.has("lint")) c.lint = "make lint";
  if (t.has("lint-fix") || t.has("lintfix")) c.lint_fix = t.has("lint-fix") ? "make lint-fix" : "make lintfix";
  if (t.has("typecheck")) c.typecheck = "make typecheck";
  if (t.has("format") || t.has("fmt")) c.format = t.has("format") ? "make format" : "make fmt";
  return c;
}

function mergePreferNonNull(a: ProjectCommands, b: ProjectCommands): ProjectCommands {
  const keys = [
    "install",
    "dev",
    "build",
    "test_all",
    "test_single",
    "lint",
    "lint_fix",
    "typecheck",
    "format",
  ] as const;
  const out = empty();
  for (const k of keys) {
    out[k] = a[k] ?? b[k] ?? null;
  }
  return out;
}

/**
 * Derive runnable commands only from manifests present in the snapshot.
 * Does not guess missing scripts; leaves fields null when unknown.
 */
export function deriveProjectCommands(
  files: Record<string, string>,
  inv: Inventory,
): ProjectCommands {
  const pkgJson = files["package.json"];
  const pyproject = files["pyproject.toml"];
  const cargo = files["Cargo.toml"];
  const makefile = files["Makefile"] ?? files["makefile"];

  let c = empty();

  if (pkgJson) {
    const scripts = parsePackageJson(pkgJson);
    if (scripts !== null) {
      const pm = resolveNodePm(files, inv);
      c = mergePreferNonNull(c, fromPackageJson(scripts, pm));
    }
  }

  if (pyproject) {
    const tasks = taskipyTaskCommands(pyproject);
    const pyInstall = pythonInstallCmd(files);
    const pyTest = pythonTestCmd(files, inv);
    const py = empty();
    if (pyInstall) py.install = pyInstall;
    if (tasks.test) {
      py.test_all = "task test";
      py.test_single = "task test -- <args>";
    } else if (pyTest) {
      py.test_all = pyTest;
      if ("uv.lock" in files) py.test_single = "uv run pytest <path>";
      else if ("poetry.lock" in files) py.test_single = "poetry run pytest <path>";
      else if ("pdm.lock" in files) py.test_single = "pdm run pytest <path>";
      else py.test_single = "pytest <path>";
    }
    c = mergePreferNonNull(c, py);
  }

  if (cargo && /^\s*\[package\]/m.test(cargo) && !pkgJson) {
    c = mergePreferNonNull(c, fromCargoToml(cargo));
  }

  if (makefile && !pkgJson) {
    c = mergePreferNonNull(c, fromMakefile(makefile));
  } else if (makefile && pkgJson) {
    const mk = fromMakefile(makefile);
    const patch = empty();
    for (const k of Object.keys(mk) as (keyof ProjectCommands)[]) {
      if (!c[k] && mk[k]) patch[k] = mk[k];
    }
    c = mergePreferNonNull(c, patch);
  }

  return c;
}

/**
 * Verbatim manifest excerpts for the extract-phase user message (prompt context).
 */
export function formatManifestExcerptsForExtract(files: Record<string, string>): string {
  const chunks: string[] = [];
  const max = 14_000;

  const push = (title: string, path: string, body: string) => {
    if (!body.trim()) return;
    chunks.push(`### ${title}\n\nPath: \`${path}\`\n\n\`\`\`\n${body.slice(0, max)}\n\`\`\``);
  };

  if (files["package.json"]) {
    const scripts = parsePackageJson(files["package.json"]);
    if (scripts && Object.keys(scripts).length > 0) {
      push("package.json scripts (keys and values)", "package.json", JSON.stringify({ scripts }, null, 2));
    } else if (files["package.json"]) {
      push("package.json (truncated)", "package.json", files["package.json"]!.slice(0, max));
    }
  }
  if (files["pyproject.toml"]) push("pyproject.toml (truncated)", "pyproject.toml", files["pyproject.toml"]!);
  if (files["Cargo.toml"]) push("Cargo.toml (truncated)", "Cargo.toml", files["Cargo.toml"]!);
  if (files["Makefile"]) push("Makefile (truncated)", "Makefile", files["Makefile"]!);
  else if (files["makefile"]) push("Makefile (truncated)", "makefile", files["makefile"]!);

  if (chunks.length === 0) return "";
  return `\n## Manifest excerpts for tooling\n\n${chunks.join("\n\n")}\n`;
}
