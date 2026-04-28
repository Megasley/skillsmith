import { describe, expect, it } from "vitest";

import {
  deriveDomainHints,
  formatDomainHintPromptSection,
  tagsForDependencyName,
} from "../../agent/domain-hints.js";

describe("deriveDomainHints", () => {
  it("maps Stripe in package.json to payments", () => {
    const hints = deriveDomainHints({
      "package.json": JSON.stringify({ dependencies: { stripe: "^14.0.0" } }),
    });
    expect(hints).toContain("payments");
  });

  it("maps Prisma and Anthropic to database and ai", () => {
    const hints = deriveDomainHints({
      "package.json": JSON.stringify({
        dependencies: { "@prisma/client": "^5", "@anthropic-ai/sdk": "^0.20" },
      }),
    });
    expect(hints).toContain("database");
    expect(hints).toContain("ai");
  });

  it("maps LDK-style crate names to bitcoin and lightning", () => {
    const hints = deriveDomainHints({
      "Cargo.toml": `[package]\nname = "demo"\n[dependencies]\nldk = "0.1"\n`,
    });
    expect(hints).toContain("bitcoin");
    expect(hints).toContain("lightning");
  });

  it("includes auth hints from next-auth", () => {
    const hints = deriveDomainHints({
      "package.json": JSON.stringify({ dependencies: { "next-auth": "^5" } }),
    });
    expect(hints).toContain("auth");
  });
});

describe("formatDomainHintPromptSection", () => {
  it("lists explicit bullets for bitcoin/lightning and ai", () => {
    const s = formatDomainHintPromptSection(["bitcoin", "ai"]);
    expect(s).toContain("HTLC");
    expect(s).toContain("prompt injection");
    expect(s).not.toContain("No domain hints");
  });

  it("returns fallback when no hints", () => {
    expect(formatDomainHintPromptSection([])).toContain("No domain hints");
  });
});

describe("tagsForDependencyName", () => {
  it("tags drizzle-orm as database", () => {
    expect(tagsForDependencyName("drizzle-orm")).toEqual(["database"]);
  });
});
