import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(path));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

const formStub = (name: string) =>
  `${name}.form = (options?: RouteQueryOptions) => ({
    action: ${name}.url(options),
    method: (${name} as { definition?: { methods?: string[] } }).definition?.methods?.find((item) => item !== "head") ?? "post",
})
`;

/** Wayfinder without --with-form omits store.form(), which blanks Inertia login. */
export function ensureWayfinderFormMethods(worktree: string): number {
  let patched = 0;
  for (const file of walkTs(join(worktree, "resources/js/actions"))) {
    const text = readFileSync(file, "utf8");
    const names = [...text.matchAll(/^export const (\w+) = /gm)].flatMap((match) => (match[1] ? [match[1]] : []));
    const missing = names.filter((name) => !text.includes(`${name}.form`));
    if (!missing.length) continue;
    const extras = missing.map(formStub).join("\n");
    const next = text.replace(/\nconst (\w+) = \{/, `\n${extras}\nconst $1 = {`);
    writeFileSync(file, next === text ? `${text}\n${extras}` : next);
    patched += 1;
  }
  return patched;
}
