import { getPlatform } from "./platform.js";
import { Reconciler } from "./reconciler.js";
import { ensureCursorAgent } from "./providers/ensure-agent.js";

if (!process.env.VITEST) {
  await ensureCursorAgent().catch((error) => {
    console.error("[atelier-supervisor] Cursor agent CLI is required for prompts", error);
  });
}

const platform = getPlatform();
if (!process.env.VITEST) {
  await platform.probeCursorApiKeys().catch((error) => {
    console.error("[atelier-supervisor] Cursor API key probe failed", error);
  });
}
const reconciler = new Reconciler();
reconciler.start();

console.info("[atelier-supervisor] ready", {
  runtime: process.env.ATELIER_RUNTIME ?? "process",
  users: platform.store.read().users.length,
  workspaces: platform.store.read().workspaces.length,
});

process.on("SIGINT", () => {
  reconciler.stop();
  process.exit(0);
});
