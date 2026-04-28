import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createProvider, estimateCost, fetchRepo, type ProviderKind } from "@skillsmith/core";

export const runtime = "nodejs";

function normalizeProvider(p: unknown): ProviderKind {
  const s = typeof p === "string" ? p.toLowerCase().trim() : "";
  if (s === "openai" || s === "ollama" || s === "anthropic") {
    return s;
  }
  return "anthropic";
}

function makeLlmProvider(kind: ProviderKind, apiKey: string) {
  if (kind === "anthropic" || kind === "openai") {
    const key = apiKey.trim();
    if (!key) {
      throw new Error("API key is required for the selected provider.");
    }
    return createProvider({ name: kind, apiKey: key });
  }
  return createProvider({ name: "ollama" });
}

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
    return NextResponse.json(
      { error: "JSON body with { repoUrl, provider?, apiKey? } is required." },
      { status: 400 },
    );
  }

  const rec = body as Record<string, unknown>;
  const repoUrl = rec.repoUrl;
  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    return NextResponse.json({ error: "repoUrl must be a non-empty string." }, { status: 400 });
  }

  const apiKey = typeof rec.apiKey === "string" ? rec.apiKey : "";
  const providerKind = normalizeProvider(rec.provider);

  if (providerKind === "anthropic" || providerKind === "openai") {
    if (!apiKey.trim()) {
      return NextResponse.json(
        { error: "apiKey is required for cost estimate with this provider." },
        { status: 400 },
      );
    }
  }

  let repo: Awaited<ReturnType<typeof fetchRepo>>;
  try {
    repo = await fetchRepo(repoUrl.trim(), session.accessToken);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch repository";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let llm: ReturnType<typeof makeLlmProvider>;
  try {
    llm = makeLlmProvider(providerKind, apiKey);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid provider configuration";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { lowUsd, highUsd, model } = estimateCost(repo, llm);
  console.info("[skillsmith] estimate — cost range (USD)", { lowUsd, highUsd, model, provider: llm.name });

  return NextResponse.json({
    lowUsd,
    highUsd,
    model,
    provider: llm.name,
  });
}
