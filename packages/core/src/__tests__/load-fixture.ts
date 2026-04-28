import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Conventions } from "../types.js";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function loadSampleConventions(): Conventions {
  return JSON.parse(
    readFileSync(path.join(fixtureDir, "sample-conventions.json"), "utf8"),
  ) as Conventions;
}
