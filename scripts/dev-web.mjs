#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startLoopbackProxy } from "./loopback-proxy.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const web = join(root, "apps/web");
const port = Number(process.env.NUXT_PORT || process.env.PORT || 43123);
const nuxtBin = [
  join(web, "node_modules/nuxt/bin/nuxt.mjs"),
  join(web, "node_modules/.bin/nuxt"),
  join(root, "node_modules/nuxt/bin/nuxt.mjs"),
  join(root, "node_modules/.bin/nuxt"),
].find((path) => existsSync(path));

if (!nuxtBin) {
  console.error("[dev-web] nuxt binary not found");
  process.exit(1);
}

const listened = await startLoopbackProxy({ targetPort: port });
const env = {
  ...process.env,
  NUXT_TELEMETRY_DISABLED: "1",
  PORT: String(port),
  NUXT_PORT: String(port),
};
if (listened.includes(80)) env.ATELIER_LOOPBACK_HTTP = "80";

const child = spawn(process.execPath, [nuxtBin, "dev", "--host", "0.0.0.0", "--port", String(port)], {
  cwd: web,
  stdio: "inherit",
  env,
});

const stop = () => {
  child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
