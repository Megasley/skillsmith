import fs from "node:fs";
import path from "node:path";

export type ResolvedTarget =
  | { kind: "local"; absolutePath: string; display: string }
  | { kind: "remote"; url: string; display: string };

const OWNER_REPO = /^[\w.-]+\/[\w.-]+$/;

function tryParseRemote(spec: string): string | null {
  const s = spec.trim();
  if (!s) return null;
  if (/^https?:\/\/(www\.)?github\.com\//i.test(s)) {
    return s;
  }
  if (/^(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(s)) {
    return "https://" + s.replace(/^\/+/, "");
  }
  if (OWNER_REPO.test(s)) {
    return `https://github.com/${s}`;
  }
  return null;
}

/**
 * Resolve CLI target: default cwd, local directory, or GitHub remote URL.
 */
export function resolveTarget(rawTarget: string | undefined, cwd: string): ResolvedTarget {
  const arg = (rawTarget ?? ".").trim() || ".";
  const resolved = path.resolve(cwd, arg);

  if (fs.existsSync(resolved)) {
    const st = fs.statSync(resolved);
    if (st.isDirectory()) {
      return { kind: "local", absolutePath: resolved, display: resolved };
    }
    throw new Error(`Not a directory: ${resolved}`);
  }

  const remote = tryParseRemote(arg);
  if (remote) {
    return { kind: "remote", url: remote, display: remote };
  }

  throw new Error(
    `Path not found: ${resolved}\n` +
      `If you meant a GitHub repo, use owner/repo or https://github.com/owner/repo`,
  );
}
