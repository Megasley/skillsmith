import { afterEach, describe, expect, it, vi } from "vitest";

import { createOllamaProvider } from "./ollama.js";

describe("createOllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns canonical JSON and eval counts from /api/chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({
        message: { content: '{"a":true}' },
        prompt_eval_count: 3,
        eval_count: 7,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = createOllamaProvider("http://localhost:11434", "llama-test");
    const r = await p.generate({
      system: "s",
      user: "u",
      maxTokens: 50,
      temperature: 0,
      expectJson: true,
    });
    expect(r.text).toBe('{"a":true}');
    expect(r.inputTokens).toBe(3);
    expect(r.outputTokens).toBe(7);
    expect(p.estimateCostUsd(1000, 1000)).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
