import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWayfinderFormMethods } from "./wayfinder-forms.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("wayfinder form helpers", () => {
  it("adds store.form when Wayfinder generated routes without --with-form", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-wf-"));
    dirs.push(dir);
    const file = join(dir, "resources/js/actions/Auth/AuthenticatedSessionController.ts");
    mkdirSync(join(dir, "resources/js/actions/Auth"), { recursive: true });
    writeFileSync(
      file,
      `export const store = (options?: RouteQueryOptions) => ({ url: store.url(options), method: "post" })
store.definition = { methods: ["post"], url: "/login" }
store.url = (options?: RouteQueryOptions) => store.definition.url

const AuthenticatedSessionController = { store }

export default AuthenticatedSessionController
`,
    );
    expect(ensureWayfinderFormMethods(dir)).toBe(1);
    const out = readFileSync(file, "utf8");
    expect(out).toContain("store.form =");
    expect(out).toContain("action: store.url(options)");
  });
});
