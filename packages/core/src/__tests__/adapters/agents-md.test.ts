import { describe, expect, it } from "vitest";

import { renderAgentsMd } from "../../adapters/agents-md.js";
import { loadSampleConventions } from "../load-fixture.js";

describe("renderAgentsMd", () => {
  it("matches snapshot", () => {
    expect(renderAgentsMd(loadSampleConventions())).toMatchSnapshot();
  });
});
