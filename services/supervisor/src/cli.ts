import { getPlatform } from "./platform.js";
import { Reconciler } from "./reconciler.js";

const platform = getPlatform();
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
