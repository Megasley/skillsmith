import { RequestError } from "@octokit/request-error";
import { Octokit } from "octokit";
import { createGunzip } from "node:zlib";
import { buffer as streamToBuffer } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import tar from "tar-stream";

import type { FetchedRepo } from "../types.js";
import {
  MAX_FILE_BYTES,
  hasSkippedPathSegment,
  shouldSkipByExtension,
  takePrioritizedFiles,
} from "./common.js";

export function parseGitHubUrl(repoUrl: string): { owner: string; repo: string } {
  const raw = repoUrl.trim();
  if (!raw) {
    throw new Error("URL is required.");
  }
  const withHost = raw.startsWith("http") ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withHost);
  } catch {
    throw new Error("Invalid URL.");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    throw new Error("URL must be a GitHub repository (e.g. https://github.com/owner/repo).");
  }
  const segments = url.pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (segments.length < 2) {
    throw new Error("Path must be /{owner}/{repo} (e.g. /vercel/next.js).");
  }
  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("Invalid owner or repository name in URL.");
  }
  return { owner, repo };
}

function errorFromOctokitOrFetch(err: unknown, owner: string, repo: string): never {
  if (err instanceof RequestError) {
    if (err.status === 404) {
      throw new Error(`Repository not found or not accessible: ${owner}/${repo}`);
    }
    if (err.status === 403) {
      throw new Error(
        `Access denied for ${owner}/${repo}. Check the token or that the repository allows access.`,
      );
    }
  }
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      throw new Error(`Repository not found: ${owner}/${repo}`);
    }
    if (status === 403) {
      throw new Error(`Access denied for ${owner}/${repo}.`);
    }
  }
  if (err instanceof Error) {
    throw new Error(err.message);
  }
  throw new Error("Unexpected error while talking to GitHub.");
}

type Collected = { path: string; content: string };

async function parseTarBuffer(tarGz: Buffer): Promise<Collected[]> {
  const collected: Collected[] = [];
  const extract = tar.extract();
  let archiveRoot: string | null = null;

  const whenDone = new Promise<Collected[]>((resolve, reject) => {
    extract.on("error", reject);
    extract.on("entry", (header, stream, next) => {
      void (async () => {
        try {
          if (header.type !== "file") {
            stream.resume();
            next();
            return;
          }
          const buf = await streamToBuffer(stream);

          if (archiveRoot === null) {
            const s = header.name.replace(/\/$/, "").split("/").filter(Boolean);
            archiveRoot = s[0] ?? null;
          }

          const normalized = header.name.replace(/\/$/, "");
          const segs = normalized.split("/").filter(Boolean);
          if (!archiveRoot || segs[0] !== archiveRoot) {
            next();
            return;
          }
          const rel = segs.slice(1).join("/");
          if (!rel) {
            next();
            return;
          }
          if (hasSkippedPathSegment(rel) || shouldSkipByExtension(rel)) {
            next();
            return;
          }
          const content =
            buf.length > MAX_FILE_BYTES
              ? buf.subarray(0, MAX_FILE_BYTES).toString("utf8") + "\n... [truncated]"
              : buf.toString("utf8");
          collected.push({ path: rel, content });
          next();
        } catch (e) {
          next(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });
    extract.on("finish", () => {
      resolve(collected);
    });
  });

  await pipeline(Readable.from(tarGz), createGunzip(), extract);
  return await whenDone;
}

/**
 * Download and parse a GitHub repository tarball into a {@link FetchedRepo} snapshot.
 */
export async function fetchGitHubRepo(repoUrl: string, accessToken?: string): Promise<FetchedRepo> {
  const { owner, repo: repoName } = parseGitHubUrl(repoUrl);
  const octokit = new Octokit({ auth: accessToken });
  let branch: string;
  try {
    const { data: repo } = await octokit.rest.repos.get({ owner, repo: repoName });
    branch = repo.default_branch;
  } catch (e) {
    errorFromOctokitOrFetch(e, owner, repoName);
  }
  if (!branch) {
    throw new Error(`No default branch for ${owner}/${repoName}.`);
  }

  const url = new URL(
    `https://api.github.com/repos/${owner}/${encodeURIComponent(repoName)}/tarball/${encodeURIComponent(branch)}`,
  );
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "skillsmith/0.1",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Repository archive not found: ${owner}/${repoName} (ref: ${branch}).`);
    }
    if (res.status === 403) {
      throw new Error(
        `Access denied when downloading ${owner}/${repoName}. A token may be required (rate limit or private repo).`,
      );
    }
    const msg = (await res.text().catch(() => "")) || res.statusText;
    throw new Error(`Failed to download repository archive (${res.status}): ${msg.slice(0, 200)}`);
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);

  let all: Collected[];
  try {
    all = await parseTarBuffer(buf);
  } catch (e) {
    if (e instanceof Error) {
      throw new Error(`Failed to extract archive: ${e.message}`);
    }
    throw e;
  }

  const { tree, files, truncated } = takePrioritizedFiles(all);
  return {
    source: "github",
    identifier: `${owner}/${repoName}@${branch}`,
    tree,
    files,
    truncated,
  };
}

/** @deprecated Use {@link fetchGitHubRepo} */
export async function fetchRepo(repoUrl: string, accessToken?: string): Promise<FetchedRepo> {
  return fetchGitHubRepo(repoUrl, accessToken);
}
