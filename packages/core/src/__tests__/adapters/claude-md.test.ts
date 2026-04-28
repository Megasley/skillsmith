import { describe, expect, it } from "vitest";

import { renderClaudeMd } from "../../adapters/claude-md.js";
import { loadSampleConventions } from "../load-fixture.js";

describe("renderClaudeMd", () => {
  it("matches snapshot", () => {
    expect(renderClaudeMd(loadSampleConventions())).toMatchSnapshot();
  });
});
