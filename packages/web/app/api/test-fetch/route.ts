import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { fetchRepo } from "@skillsmith/core";

function bearerFromRequest(request: Request): string | undefined {
  const h = request.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("bearer ")) return undefined;
  const t = h.slice(7).trim();
  return t || undefined;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const headerToken = bearerFromRequest(request);
    const accessToken = headerToken ?? session?.accessToken;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("repoUrl" in body)) {
      return NextResponse.json({ error: "JSON body with { repoUrl: string } is required." }, { status: 400 });
    }
    const repoUrl = (body as { repoUrl?: unknown }).repoUrl;
    if (typeof repoUrl !== "string" || !repoUrl.trim()) {
      return NextResponse.json({ error: "repoUrl must be a non-empty string." }, { status: 400 });
    }

    const result = await fetchRepo(repoUrl.trim(), accessToken);

    return NextResponse.json({
      source: result.source,
      identifier: result.identifier,
      tree: result.tree,
      fileCount: result.tree.length,
      truncated: result.truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const lower = message.toLowerCase();
    const status =
      lower.includes("invalid") || lower.includes("required") || lower.includes("must be a github")
        ? 400
        : lower.includes("not found")
          ? 404
          : lower.includes("access denied") || lower.includes("rate limit")
            ? 403
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
