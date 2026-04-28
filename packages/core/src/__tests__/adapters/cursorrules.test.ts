import { describe, expect, it } from "vitest";

import { renderCursorrules } from "../../adapters/cursorrules.js";
import { loadSampleConventions } from "../load-fixture.js";

describe("renderCursorrules", () => {
  it("matches snapshot", () => {
    expect(renderCursorrules(loadSampleConventions())).toMatchSnapshot();
  });
});
