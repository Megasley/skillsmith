import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
/** `packages/cli/package.json` — one level above `dist/`. */
export const CLI_VERSION = (
  JSON.parse(readFileSync(path.join(dir, "..", "package.json"), "utf8")) as { version: string }
).version;
