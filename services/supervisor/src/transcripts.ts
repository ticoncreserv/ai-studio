import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionEvent } from "@atelier/contracts";
import { repoRoot } from "./paths.js";

const here = dirname(fileURLToPath(import.meta.url));

export function loadTranscript(name = "create-inertia-page.ndjson"): SessionEvent[] {
  const candidates = [
    join(repoRoot(), "fixtures/acp", name),
    join(process.cwd(), "fixtures/acp", name),
    join(process.cwd(), "../fixtures/acp", name),
    join(process.cwd(), "../../fixtures/acp", name),
    join(here, "../../fixtures/acp", name),
    join(here, "../../../fixtures/acp", name),
  ];
  const file = candidates.find((path) => existsSync(path));
  if (!file) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent);
}
