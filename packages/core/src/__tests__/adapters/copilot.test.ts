import { describe, expect, it } from "vitest";

import { renderCopilot } from "../../adapters/copilot.js";
import { loadSampleConventions } from "../load-fixture.js";

describe("renderCopilot", () => {
  it("matches snapshot", () => {
    expect(renderCopilot(loadSampleConventions())).toMatchSnapshot();
  });
});
