import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import ignore from "ignore";

import type { FetchedRepo } from "../types.js";
import {
  MAX_FILE_BYTES,
  hasSkippedPathSegment,
  shouldSkipByExtension,
  takePrioritizedFiles,
} from "./common.js";

async function loadGitignoreRules(rootAbs: string): Promise<ignore.Ignore> {
  const ig = ignore();
  try {
    const gi = await readFile(path.join(rootAbs, ".gitignore"), "utf8");
    ig.add(gi);
  } catch {
    /* no .gitignore */
  }
  return ig;
}

function posixRel(fileAbs: string, rootAbs: string): string {
  const rel = path.relative(rootAbs, fileAbs);
  return rel.split(path.sep).join("/");
}

/**
 * Walk a local directory (respecting `.gitignore`) and build a {@link FetchedRepo} snapshot.
 */
export async function fetchLocalRepo(rootPath: string): Promise<FetchedRepo> {
  const rootAbs = path.resolve(rootPath);
  const ig = await loadGitignoreRules(rootAbs);

  const entries = await fg("**/*", {
    cwd: rootAbs,
    onlyFiles: true,
    dot: true,
    absolute: true,
    followSymbolicLinks: false,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
    ],
  });

  const collected: { path: string; content: string }[] = [];

  for (const fileAbs of entries) {
    const rel = posixRel(fileAbs, rootAbs);
    if (!rel || rel.startsWith("..")) {
      continue;
    }
    if (ig.ignores(rel)) {
      continue;
    }
    if (hasSkippedPathSegment(rel) || shouldSkipByExtension(rel)) {
      continue;
    }

    let buf: Buffer;
    try {
      buf = await readFile(fileAbs);
    } catch {
      continue;
    }

    const content =
      buf.length > MAX_FILE_BYTES
        ? buf.subarray(0, MAX_FILE_BYTES).toString("utf8") + "\n... [truncated]"
        : buf.toString("utf8");
    collected.push({ path: rel, content });
  }

  const { tree, files, truncated } = takePrioritizedFiles(collected);
  return {
    source: "local",
    identifier: rootAbs,
    tree,
    files,
    truncated,
  };
}
