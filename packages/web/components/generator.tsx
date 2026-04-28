"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type PhaseId = "inventory" | "sample" | "extract" | "reduce" | "subagents";

const PHASES: { id: PhaseId; label: string }[] = [
  { id: "inventory", label: "Inventory" },
  { id: "sample", label: "Sample" },
  { id: "extract", label: "Extract" },
  { id: "reduce", label: "Rule reduction" },
  { id: "subagents", label: "Subagents" },
];

type StepStatus = "pending" | "running" | "done";

type GenStatus = "idle" | "generating" | "success" | "error";

type AgentEvent = { phase: string; message: string; data?: unknown };

type LlmProviderId = "anthropic" | "openai" | "ollama";

const FORMAT_OPTIONS = [
  { id: "claude-md", label: ".claude/CLAUDE.md", short: "CLAUDE" },
  { id: "cursorrules", label: ".cursorrules", short: ".cursorrules" },
  { id: "agents-md", label: "AGENTS.md", short: "AGENTS.md" },
  { id: "copilot", label: "Copilot instructions", short: "Copilot" },
] as const;

type FormatId = (typeof FORMAT_OPTIONS)[number]["id"];

const ALL_FORMAT_IDS: FormatId[] = FORMAT_OPTIONS.map((f) => f.id);

type SubagentConfidence = "high" | "medium" | "low";

type SubagentArtifact = {
  id: string;
  name: string;
  description: string;
  confidence: SubagentConfidence;
  filename: string;
  content: string;
  cursorFilename?: string;
  cursorContent?: string;
};

type AgentsJsonArtifact = {
  filename: string;
  content: string;
};

function normalizeSubagentConfidence(c: unknown): SubagentConfidence {
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

function normalizeSubagentArtifacts(raw: unknown): SubagentArtifact[] {
  if (!Array.isArray(raw)) return [];
  const out: SubagentArtifact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name : "";
    const description = typeof o.description === "string" ? o.description : "";
    const filename = typeof o.filename === "string" ? o.filename : "";
    const content = typeof o.content === "string" ? o.content : "";
    if (!id || !content) continue;
    const cursorFilename = typeof o.cursorFilename === "string" ? o.cursorFilename : undefined;
    const cursorContent = typeof o.cursorContent === "string" ? o.cursorContent : undefined;
    out.push({
      id,
      name: name || id,
      description,
      confidence: normalizeSubagentConfidence(o.confidence),
      filename: filename || `.claude/agents/${id}.md`,
      content,
      ...(cursorFilename && cursorContent
        ? { cursorFilename, cursorContent }
        : {}),
    });
  }
  return out;
}

function normalizeAgentsJson(raw: unknown): AgentsJsonArtifact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const content = typeof o.content === "string" ? o.content : "";
  if (!content.trim()) return null;
  const filename = typeof o.filename === "string" && o.filename.trim() ? o.filename : "agents.json";
  return { filename, content };
}

const LS_PROVIDER = "skillsmith.llm.provider";
const LS_API_KEY = "skillsmith.llm.apiKey";
const LS_CURSOR_SUBAGENTS = "skillsmith.cursorSubagents";

function mapDetectedToFormats(detected: string[]): FormatId[] {
  const set = new Set<FormatId>();
  for (const d of detected) {
    if (d === "claude-md") set.add("claude-md");
    if (d === "cursorrules" || d === "cursor-rules-dir") set.add("cursorrules");
    if (d === "agents-md") set.add("agents-md");
    if (d === "copilot") set.add("copilot");
  }
  return [...set];
}

const EXAMPLES = [
  { label: "vercel/ai-chatbot", url: "https://github.com/vercel/ai-chatbot" },
  { label: "shadcn-ui/ui", url: "https://github.com/shadcn-ui/ui" },
  { label: "tiangolo/fastapi", url: "https://github.com/tiangolo/fastapi" },
];

function initPhases(): Record<PhaseId, StepStatus> {
  return {
    inventory: "pending",
    sample: "pending",
    extract: "pending",
    reduce: "pending",
    subagents: "pending",
  };
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function* streamSSE(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<AgentEvent, void, undefined> {
  if (!body) return;
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            yield JSON.parse(raw) as AgentEvent;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw) {
          try {
            yield JSON.parse(raw) as AgentEvent;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }
}

function applyPhaseFromEvent(
  event: AgentEvent,
  prev: Record<PhaseId, StepStatus>,
): Record<PhaseId, StepStatus> {
  const next = { ...prev } as Record<PhaseId, StepStatus>;
  const order: PhaseId[] = ["inventory", "sample", "extract", "reduce", "subagents"];
  if (event.phase === "error") {
    return prev;
  }
  if (event.phase === "done") {
    for (const id of order) next[id] = "done";
    return next;
  }
  const p = event.phase as PhaseId;
  if (!order.includes(p)) return prev;
  const i = order.indexOf(p);
  for (let j = 0; j < i; j++) {
    next[order[j]!] = "done";
  }
  for (let j = i + 1; j < order.length; j++) {
    next[order[j]!] = "pending";
  }
  next[p] = "running";
  return next;
}

function providerLabel(id: LlmProviderId): string {
  if (id === "openai") return "OpenAI";
  if (id === "ollama") return "Ollama";
  return "Anthropic";
}

export function Generator() {
  const { data: session, status: sessionStatus } = useSession();
  const [repoUrl, setRepoUrl] = useState("");
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [phases, setPhases] = useState<Record<PhaseId, StepStatus>>(initPhases);
  const [error, setError] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [artifactOutputs, setArtifactOutputs] = useState<Record<
    string,
    { filename: string; content: string }
  > | null>(null);
  const [subagentArtifacts, setSubagentArtifacts] = useState<SubagentArtifact[] | null>(null);
  const [agentsJsonArtifact, setAgentsJsonArtifact] = useState<AgentsJsonArtifact | null>(null);
  const [includeCursorSubagents, setIncludeCursorSubagents] = useState(false);

  const [llmProvider, setLlmProvider] = useState<LlmProviderId>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftProvider, setDraftProvider] = useState<LlmProviderId>("anthropic");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [selectedFormats, setSelectedFormats] = useState<FormatId[]>([...ALL_FORMAT_IDS]);
  const [autoDetectFormats, setAutoDetectFormats] = useState(false);

  const [costEstimate, setCostEstimate] = useState<{
    lowUsd: number;
    highUsd: number;
    model: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const p = localStorage.getItem(LS_PROVIDER);
      if (p === "openai" || p === "ollama" || p === "anthropic") {
        setLlmProvider(p);
        setDraftProvider(p);
      }
      const k = localStorage.getItem(LS_API_KEY);
      if (k) {
        setApiKey(k);
        setDraftApiKey(k);
      }
      if (localStorage.getItem(LS_CURSOR_SUBAGENTS) === "1") {
        setIncludeCursorSubagents(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (session) {
      setSignInRequired(false);
    }
  }, [session]);

  const openSettings = useCallback(() => {
    setDraftProvider(llmProvider);
    setDraftApiKey(apiKey);
    setSettingsOpen(true);
  }, [llmProvider, apiKey]);

  const saveSettings = useCallback(() => {
    setLlmProvider(draftProvider);
    setApiKey(draftApiKey);
    try {
      localStorage.setItem(LS_PROVIDER, draftProvider);
      localStorage.setItem(LS_API_KEY, draftApiKey);
    } catch {
      toast.error("Could not save settings to browser storage.");
      return;
    }
    toast.success("Settings saved locally.");
    setSettingsOpen(false);
  }, [draftProvider, draftApiKey]);

  const toggleFormat = useCallback((id: FormatId, checked: boolean) => {
    setSelectedFormats((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id];
      }
      const next = prev.filter((x) => x !== id);
      return next.length > 0 ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!autoDetectFormats || sessionStatus !== "authenticated" || !repoUrl.trim()) {
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/detect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ repoUrl: repoUrl.trim() }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { detected?: string[] };
          const mapped = mapDetectedToFormats(data.detected ?? []);
          if (mapped.length > 0) {
            setSelectedFormats(mapped);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [autoDetectFormats, repoUrl, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !repoUrl.trim()) {
      setCostEstimate(null);
      return;
    }
    if (llmProvider !== "ollama" && !apiKey.trim()) {
      setCostEstimate(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              repoUrl: repoUrl.trim(),
              provider: llmProvider,
              apiKey,
            }),
          });
          if (!res.ok) {
            setCostEstimate(null);
            return;
          }
          const j = (await res.json()) as { lowUsd?: number; highUsd?: number; model?: string };
          if (
            typeof j.lowUsd === "number" &&
            typeof j.highUsd === "number" &&
            typeof j.model === "string"
          ) {
            setCostEstimate({ lowUsd: j.lowUsd, highUsd: j.highUsd, model: j.model });
          }
        } catch {
          setCostEstimate(null);
        }
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [repoUrl, sessionStatus, llmProvider, apiKey]);

  const onSubmitFixed = useCallback(async () => {
    const url = repoUrl.trim();
    if (!url) {
      setError("Enter a repository URL.");
      return;
    }
    if (sessionStatus === "unauthenticated") {
      setSignInRequired(true);
      setError(null);
      return;
    }
    if (llmProvider !== "ollama" && !apiKey.trim()) {
      setError("Add your LLM API key in Settings (BYOK).");
      openSettings();
      return;
    }
    setError(null);
    setSignInRequired(false);
    setArtifactOutputs(null);
    setSubagentArtifacts(null);
    setAgentsJsonArtifact(null);
    setGenStatus("generating");
    setPhases(() => {
      const s = initPhases();
      s.inventory = "running";
      return s;
    });

    let res: Response;
    try {
      res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          repoUrl: url,
          provider: llmProvider,
          apiKey,
          formats: selectedFormats,
          cursorSubagents: includeCursorSubagents,
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setGenStatus("error");
      setPhases(initPhases());
      return;
    }

    if (res.status === 401) {
      setSignInRequired(true);
      setGenStatus("idle");
      setPhases(initPhases());
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* keep */
      }
      setError(msg);
      setGenStatus("error");
      setPhases(initPhases());
      return;
    }

    if (!res.body) {
      setError("No response body.");
      setGenStatus("error");
      setPhases(initPhases());
      return;
    }

    try {
      let gotArtifacts = false;
      for await (const event of streamSSE(res.body)) {
        if (event.phase === "error") {
          setError(event.message);
          setGenStatus("error");
          setPhases(initPhases());
          return;
        }
        if (event.phase === "done") {
          setPhases((prev) => applyPhaseFromEvent(event, prev));
          continue;
        }
        if (event.phase === "artifacts") {
          setPhases({
            inventory: "done",
            sample: "done",
            extract: "done",
            reduce: "done",
            subagents: "done",
          });
          const d = event.data as {
            outputs?: Record<string, { filename: string; content: string }>;
            subagents?: SubagentArtifact[];
            agentsJson?: unknown;
          };
          if (d?.outputs && typeof d.outputs === "object") {
            setArtifactOutputs(d.outputs);
          }
          setSubagentArtifacts(normalizeSubagentArtifacts(d?.subagents));
          setAgentsJsonArtifact(normalizeAgentsJson(d?.agentsJson));
          setGenStatus("success");
          gotArtifacts = true;
          return;
        }
        setPhases((prev) => applyPhaseFromEvent(event, prev));
      }
      if (!gotArtifacts) {
        setError("Stream ended without rendered outputs.");
        setGenStatus("error");
        setPhases(initPhases());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read stream");
      setGenStatus("error");
      setPhases(initPhases());
    }
  }, [repoUrl, sessionStatus, llmProvider, apiKey, selectedFormats, includeCursorSubagents, openSettings]);

  const showStepper = genStatus === "generating" || (genStatus === "success" && !error);
  const busy = genStatus === "generating";

  const tabEntries = artifactOutputs
    ? FORMAT_OPTIONS.filter((f) => f.id in artifactOutputs && artifactOutputs[f.id])
    : [];

  const defaultTab = tabEntries[0]?.id ?? "claude-md";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setSettingsOpen(false)}
        >
          <Card
            className="relative z-10 w-full max-w-md border-border/80 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Settings</CardTitle>
              <CardDescription>
                Your API key stays in this browser only. It is sent to the server only when you run
                Generate or refresh the cost estimate — never stored server-side.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="llm-provider" className="text-sm font-medium">
                  Provider
                </label>
                <select
                  id="llm-provider"
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  value={draftProvider}
                  onChange={(e) => setDraftProvider(e.target.value as LlmProviderId)}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama (local)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="llm-key" className="text-sm font-medium">
                  API key {draftProvider === "ollama" ? "(optional for local)" : ""}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="llm-key"
                    type={showApiKey ? "text" : "password"}
                    autoComplete="off"
                    value={draftApiKey}
                    onChange={(e) => setDraftApiKey(e.target.value)}
                    placeholder={draftProvider === "ollama" ? "Not used for Ollama" : "sk-…"}
                    className="min-w-0 flex-1 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground"
                    onClick={() => setShowApiKey((v) => !v)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveSettings}>
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <header className="border-b border-border/80 bg-card/30 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-border"
              aria-hidden
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight">Skillsmith</p>
              <p className="text-xs text-muted-foreground truncate sm:text-sm">
                Generate AI rules from any repo
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={openSettings}
              aria-label="Open settings"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            {sessionStatus === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : session ? (
              <>
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-8 w-8 rounded-full ring-1 ring-border"
                    width={32}
                    height={32}
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-1 ring-border"
                    aria-hidden
                  >
                    {(session.user?.name || session.user?.email || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="hidden max-w-[8rem] truncate text-sm text-muted-foreground sm:inline">
                  {session.user?.name || session.user?.email}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => void signOut()}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => void signIn("github")}>
                Sign in with GitHub
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Generate from a repo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fetch a GitHub snapshot, extract conventions with your API key (BYOK), and export
            CLAUDE.md, .cursorrules, AGENTS.md, and Copilot instructions. After each successful run
            you also get{" "}
            <span className="text-foreground/90">task subagents</span> (Claude Code{" "}
            <span className="font-mono text-xs">.claude/agents/*.md</span>, portable{" "}
            <span className="font-mono text-xs">agents.json</span>
            {includeCursorSubagents ? (
              <>
                , Cursor <span className="font-mono text-xs">.cursor/rules/*.mdc</span>
              </>
            ) : null}
            ) below the main output tabs.
          </p>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">Repository</CardTitle>
            <CardDescription>HTTPS link to a GitHub repository you can access</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                className="sm:flex-1"
                type="url"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) void onSubmitFixed();
                }}
              />
              <Button
                type="button"
                className="shrink-0"
                onClick={() => void onSubmitFixed()}
                disabled={busy || !repoUrl.trim()}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generating
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
            </div>

            {costEstimate && sessionStatus === "authenticated" && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal text-muted-foreground">
                  Est. cost: ~${costEstimate.lowUsd.toFixed(2)}–${costEstimate.highUsd.toFixed(2)} with{" "}
                  {providerLabel(llmProvider)} ({costEstimate.model})
                </Badge>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Output formats</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FORMAT_OPTIONS.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2 text-sm leading-none"
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                      checked={selectedFormats.includes(f.id)}
                      disabled={busy}
                      onChange={(e) => toggleFormat(f.id, e.target.checked)}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={autoDetectFormats}
                  disabled={busy}
                  onChange={(e) => setAutoDetectFormats(e.target.checked)}
                />
                Auto-detect from repo (uses GitHub snapshot; checks existing AI config files)
              </label>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">Subagents &amp; manifest</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Always generated when the pipeline runs (same as the CLI): one Claude Code markdown
                file per subagent under <span className="font-mono">.claude/agents/</span>, plus{" "}
                <span className="font-mono">agents.json</span> at the repo root. Shown in the{" "}
                <strong className="font-medium text-foreground">Subagents</strong> section after this
                page finishes.
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm leading-snug">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary"
                  checked={includeCursorSubagents}
                  disabled={busy}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setIncludeCursorSubagents(on);
                    try {
                      localStorage.setItem(LS_CURSOR_SUBAGENTS, on ? "1" : "0");
                    } catch {
                      /* ignore */
                    }
                  }}
                />
                <span>
                  Also include Cursor rules previews (
                  <span className="font-mono text-xs">.cursor/rules/skillsmith-*.mdc</span>
                  ) — mirrors the CLI <span className="font-mono text-xs">--cursor</span> flag.
                </span>
              </label>
            </div>

            {sessionStatus === "unauthenticated" && (
              <p className="text-xs text-muted-foreground">
                Sign in with GitHub to fetch the repo. Bring your own LLM key in Settings.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.url}
                  type="button"
                  disabled={busy}
                  onClick={() => setRepoUrl(ex.url)}
                  className="inline-flex"
                >
                  <Badge
                    variant="secondary"
                    className="cursor-pointer font-normal transition-colors hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {ex.label}
                  </Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {showStepper && (
          <Card className="mt-6 border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Generation in progress</CardTitle>
              <CardDescription>Pipeline status for your run</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="ml-1.5 space-y-5 border-l-2 border-border/70 pl-6">
                {PHASES.map((step) => {
                  const st = phases[step.id];
                  return (
                    <div key={step.id} className="relative -ml-[1.4rem] flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background">
                        {st === "done" && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/35 animate-in zoom-in-50 duration-200">
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </div>
                        )}
                        {st === "running" && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/35">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          </div>
                        )}
                        {st === "pending" && (
                          <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 ring-1 ring-border" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-6">{step.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {st === "pending" && "Waiting"}
                          {st === "running" && "In progress"}
                          {st === "done" && "Complete"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {signInRequired && (
          <Card
            className="mt-6 border-border/80 bg-muted/20 animate-in fade-in duration-200"
            role="status"
          >
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-border">
                  <LogIn className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">Sign in to continue</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    GitHub sign-in is only used to download the repository tarball. Your LLM API key
                    is configured locally under Settings (BYOK) and is not stored on our servers.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button type="button" onClick={() => void signIn("github")} className="gap-2">
                <LogIn className="h-3.5 w-3.5" />
                Sign in with GitHub
              </Button>
            </CardContent>
          </Card>
        )}

        {error && !signInRequired && (
          <Card
            className="mt-6 border-destructive/40 bg-destructive/5 animate-in fade-in duration-200"
            role="alert"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-destructive">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-destructive/90 whitespace-pre-wrap">{error}</p>
            </CardContent>
          </Card>
        )}

        {artifactOutputs && genStatus === "success" && tabEntries.length > 0 && (
          <Card
            className="mt-6 overflow-hidden border-border/80 shadow-md animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <CardHeader>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <CardTitle className="text-base">Output</CardTitle>
                  <CardDescription>Copy or download each generated file</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className="mb-3 w-full flex-wrap justify-start gap-0.5 rounded-lg bg-muted/40 p-1">
                  {tabEntries.map((f) => (
                    <TabsTrigger key={f.id} value={f.id}>
                      {f.short}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabEntries.map((f) => {
                  const out = artifactOutputs[f.id];
                  if (!out) return null;
                  return (
                    <ResultTab key={f.id} value={f.id} fileName={out.filename} content={out.content} />
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {genStatus === "success" && subagentArtifacts !== null && (
          <Card className="mt-6 overflow-hidden border-border/80 shadow-md animate-in fade-in slide-in-from-bottom-1 duration-300">
            <CardHeader>
              <CardTitle className="text-base">Subagents</CardTitle>
              <CardDescription>
                Claude Code agent definitions and portable manifest. Copy into your project tree.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {agentsJsonArtifact ? (
                <AgentsJsonRow artifact={agentsJsonArtifact} />
              ) : null}
              {subagentArtifacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subagents were generated for this repository.
                </p>
              ) : (
                subagentArtifacts.map((sa) => <SubagentResultRow key={sa.id} artifact={sa} />)
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function confidenceBadgeVariant(
  c: SubagentConfidence,
): "default" | "secondary" | "outline" {
  if (c === "high") return "default";
  if (c === "medium") return "secondary";
  return "outline";
}

function AgentsJsonRow({ artifact }: { artifact: AgentsJsonArtifact }) {
  const [open, setOpen] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(artifact.content);
    toast.success("Copied to clipboard", { description: artifact.filename });
  };
  return (
    <div className="rounded-lg border border-border/80 bg-muted/10">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <span className="font-medium leading-tight">Portable manifest</span>
            <p className="font-mono text-xs text-muted-foreground">{artifact.filename}</p>
            <p className="text-xs text-muted-foreground">
              Machine-readable list of subagents (CLI and{" "}
              <span className="font-mono">skillsmith compile</span>).
            </p>
          </div>
        </button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8 shrink-0 gap-1.5 self-start sm:self-center"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      {open ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-0">
          <pre
            className={cn(
              "mt-3 max-h-[min(280px,40vh)] overflow-auto rounded-md border border-border bg-zinc-950/90 p-3",
              "font-mono text-xs leading-relaxed text-zinc-100",
            )}
          >
            {artifact.content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function SubagentResultRow({ artifact }: { artifact: SubagentArtifact }) {
  const [open, setOpen] = useState(false);
  const hasCursor = Boolean(artifact.cursorContent && artifact.cursorFilename);
  const [previewTab, setPreviewTab] = useState<"claude" | "cursor">("claude");

  const onCopyMd = () => {
    void navigator.clipboard.writeText(artifact.content);
    toast.success("Copied to clipboard", { description: artifact.filename });
  };
  const onCopyCursor = () => {
    if (!artifact.cursorContent || !artifact.cursorFilename) return;
    void navigator.clipboard.writeText(artifact.cursorContent);
    toast.success("Copied to clipboard", { description: artifact.cursorFilename });
  };

  return (
    <div className="rounded-lg border border-border/80 bg-muted/10">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium leading-tight">{artifact.name}</span>
              <Badge variant={confidenceBadgeVariant(artifact.confidence)} className="font-normal">
                {artifact.confidence} confidence
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-snug">{artifact.description}</p>
            <p className="font-mono text-xs text-muted-foreground">{artifact.filename}</p>
            {hasCursor ? (
              <p className="font-mono text-xs text-muted-foreground">{artifact.cursorFilename}</p>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap gap-1.5 self-start sm:justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              onCopyMd();
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy .md
          </Button>
          {hasCursor ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onCopyCursor();
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy .mdc
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="border-t border-border/60 px-3 pb-3 pt-0">
          {hasCursor ? (
            <Tabs
              value={previewTab}
              onValueChange={(v) => setPreviewTab(v as "claude" | "cursor")}
              className="mt-3 w-full"
            >
              <TabsList className="mb-2 h-8 w-full flex-wrap justify-start gap-0.5 rounded-md bg-muted/40 p-1 sm:w-auto">
                <TabsTrigger value="claude" className="text-xs">
                  Claude Code (.md)
                </TabsTrigger>
                <TabsTrigger value="cursor" className="text-xs">
                  Cursor (.mdc)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="claude" className="mt-0">
                <pre
                  className={cn(
                    "max-h-[min(360px,45vh)] overflow-auto rounded-md border border-border bg-zinc-950/90 p-3",
                    "font-mono text-xs leading-relaxed text-zinc-100",
                  )}
                >
                  {artifact.content}
                </pre>
              </TabsContent>
              <TabsContent value="cursor" className="mt-0">
                <pre
                  className={cn(
                    "max-h-[min(360px,45vh)] overflow-auto rounded-md border border-border bg-zinc-950/90 p-3",
                    "font-mono text-xs leading-relaxed text-zinc-100",
                  )}
                >
                  {artifact.cursorContent ?? ""}
                </pre>
              </TabsContent>
            </Tabs>
          ) : (
            <pre
              className={cn(
                "mt-3 max-h-[min(360px,45vh)] overflow-auto rounded-md border border-border bg-zinc-950/90 p-3",
                "font-mono text-xs leading-relaxed text-zinc-100",
              )}
            >
              {artifact.content}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResultTab({
  value,
  fileName,
  content,
}: {
  value: string;
  fileName: string;
  content: string;
}) {
  const onCopy = () => {
    void navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard", { description: fileName });
  };
  const onDownload = () => {
    downloadText(fileName, content);
    toast.info("Download started", { description: fileName });
  };
  return (
    <TabsContent value={value} className="mt-0">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-zinc-950/80 ring-1 ring-white/5"
        data-slot="code-panel"
      >
        <div className="absolute right-2 top-2 z-10 flex gap-1.5">
          <Button type="button" size="sm" variant="secondary" className="h-7 gap-1.5" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-7 gap-1.5" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <pre
          className={cn(
            "max-h-[min(480px,55vh)] overflow-auto p-4 pt-12 font-mono text-xs leading-relaxed",
            "text-zinc-100",
          )}
        >
          {content}
        </pre>
      </div>
    </TabsContent>
  );
}
