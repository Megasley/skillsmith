import { beforeEach, describe, expect, it, vi } from "vitest";

const completionsCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"x":1}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
);

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: completionsCreate } };
  },
}));

import { createOpenAIProvider } from "./openai.js";

describe("createOpenAIProvider", () => {
  beforeEach(() => {
    completionsCreate.mockClear();
  });

  it("uses json_object response_format and returns canonical JSON when expectJson is true", async () => {
    const p = createOpenAIProvider("sk-test", "gpt-test");
    const r = await p.generate({
      system: "sys",
      user: "usr",
      maxTokens: 100,
      temperature: 0,
      expectJson: true,
    });
    expect(r.text).toBe('{"x":1}');
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    expect(completionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        response_format: { type: "json_object" },
      }),
    );
  });
});
