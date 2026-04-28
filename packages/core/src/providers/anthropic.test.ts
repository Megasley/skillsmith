import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    content: [{ type: "text", text: '{"hello":"world"}' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }),
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { createAnthropicProvider } from "./anthropic.js";

describe("createAnthropicProvider", () => {
  beforeEach(() => {
    messagesCreate.mockClear();
  });

  it("returns canonical JSON and usage when expectJson is true", async () => {
    const p = createAnthropicProvider("test-key", "claude-test");
    const r = await p.generate({
      system: "sys",
      user: "usr",
      maxTokens: 100,
      temperature: 0,
      expectJson: true,
    });
    expect(r.text).toBe('{"hello":"world"}');
    expect(r.inputTokens).toBe(100);
    expect(r.outputTokens).toBe(50);
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-test",
        system: expect.stringContaining("single valid JSON"),
      }),
    );
  });
});
