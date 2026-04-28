import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { detectExistingFormats, fetchRepo } from "@skillsmith/core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("repoUrl" in body)) {
    return NextResponse.json({ error: "JSON body with { repoUrl: string } is required." }, { status: 400 });
  }

  const repoUrl = (body as { repoUrl?: unknown }).repoUrl;
  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    return NextResponse.json({ error: "repoUrl must be a non-empty string." }, { status: 400 });
  }

  try {
    const repo = await fetchRepo(repoUrl.trim(), session.accessToken);
    const detected = detectExistingFormats(repo);
    return NextResponse.json({ detected });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch repository";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
