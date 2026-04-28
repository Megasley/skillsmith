export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_FILES = 500;

export const MANIFEST_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "requirements.txt",
  "readme.md",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.app.json",
  "turbo.json",
  "vercel.json",
]);

export const CODE_LIKE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rs|go|rb|mdx)$/i;

const BINARY_EXT =
  /\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|eot|mp4|mov|webm|mp3|wav|pdf|zip|tar|gz)$/i;

export const SKIPPED_DIR_SEGMENTS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "vendor",
  "target",
  ".venv",
  "__pycache__",
]);

export function pathSelectionOrder(path: string): 0 | 1 | 2 {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (MANIFEST_BASENAMES.has(base)) {
    return 0;
  }
  if (
    /^next\.config\./i.test(base) ||
    /^vite\.config\./i.test(base) ||
    /^eslint\.config\./i.test(base)
  ) {
    return 0;
  }
  if (CODE_LIKE.test(path)) {
    return 1;
  }
  return 2;
}

export function hasSkippedPathSegment(relative: string): boolean {
  if (!relative) return false;
  return relative.split("/").some((p) => SKIPPED_DIR_SEGMENTS.has(p));
}

export function shouldSkipByExtension(relative: string): boolean {
  const base = relative.split("/").pop() ?? relative;
  return BINARY_EXT.test(base);
}

export function sortCollectedPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => {
    const oa = pathSelectionOrder(a);
    const ob = pathSelectionOrder(b);
    if (oa !== ob) {
      return oa - ob;
    }
    return a.localeCompare(b, "en");
  });
}

export function takePrioritizedFiles(
  entries: { path: string; content: string }[],
): { tree: string[]; files: Record<string, string>; truncated: boolean } {
  const sorted = [...entries].sort((a, b) => {
    const oa = pathSelectionOrder(a.path);
    const ob = pathSelectionOrder(b.path);
    if (oa !== ob) {
      return oa - ob;
    }
    return a.path.localeCompare(b.path, "en");
  });
  const overCap = sorted.length > MAX_FILES;
  const taken = sorted.slice(0, MAX_FILES);
  const files: Record<string, string> = {};
  for (const item of taken) {
    files[item.path] = item.content;
  }
  return {
    tree: taken.map((t) => t.path),
    files,
    truncated: overCap,
  };
}
