#!/usr/bin/env node
// Replays the recorded ACP handshake. Live authenticate fails with an Origin-scoped token.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/acp/initialize-handshake.ndjson");
const lines = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const init = lines.find((l) => l.dir === "in" && l.msg?.result?.protocolVersion);
const auth = lines.find((l) => l.dir === "in" && l.msg?.error);
console.info("initialize", init ? "ok" : "missing");
console.info("authenticate", auth?.msg?.error?.data?.details ?? "missing");
if (!init) process.exit(1);
