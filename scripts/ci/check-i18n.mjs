#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const en = JSON.parse(readFileSync(join(root, "apps/web/i18n/locales/en.json"), "utf8"));
const pt = JSON.parse(readFileSync(join(root, "apps/web/i18n/locales/pt-BR.json"), "utf8"));

function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" ? keys(v, path) : [path];
  });
}

const enKeys = new Set(keys(en));
const ptKeys = new Set(keys(pt));
const missing = [...enKeys].filter((k) => !ptKeys.has(k));
const extra = [...ptKeys].filter((k) => !enKeys.has(k));
if (missing.length || extra.length) {
  console.error("i18n key mismatch");
  if (missing.length) console.error("missing in pt-BR:", missing.join(", "));
  if (extra.length) console.error("extra in pt-BR:", extra.join(", "));
  process.exit(1);
}
console.info(`i18n parity ok (${enKeys.size} keys)`);
