import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureViteHotFile, publicViteOrigin, viteDevAssetPath, writeViteAtelierConfig, writeViteHotFile } from "./vite-preview.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("vite preview urls", () => {
  it("scopes the public Vite origin under the preview token", () => {
    expect(publicViteOrigin("http://127.0.0.1:43123/-/p/tok")).toBe("/-/p/tok/__vite");
    expect(publicViteOrigin("http://127.0.0.1:43123/-/p/tok/")).toBe("/-/p/tok/__vite");
    expect(publicViteOrigin("https://studio.example/-/p/tok")).toBe("/-/p/tok/__vite");
  });

  it("strips the preview prefix before forwarding to Vite", () => {
    expect(viteDevAssetPath("__vite/@vite/client")).toBe("/@vite/client");
    expect(viteDevAssetPath("__vite/resources/js/app.ts")).toBe("/resources/js/app.ts");
    expect(viteDevAssetPath("__vite")).toBe("/");
    expect(viteDevAssetPath("login")).toBeNull();
    expect(viteDevAssetPath("@vite/client")).toBe("/@vite/client");
    expect(viteDevAssetPath("resources/js/pages/auth/Login.vue")).toBe("/resources/js/pages/auth/Login.vue");
  });

  it("writes the Laravel hot file and atelier Vite config", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-vite-"));
    temps.push(dir);
    writeViteHotFile(dir, "http://127.0.0.1:43123/-/p/tok/__vite");
    expect(readFileSync(join(dir, "public", "hot"), "utf8")).toBe("http://127.0.0.1:43123/-/p/tok/__vite");
    const config = writeViteAtelierConfig(dir);
    expect(readFileSync(config, "utf8")).toContain("@laravel/vite-plugin-wayfinder");
    expect(readFileSync(config, "utf8")).toContain("vite-plugin-full-reload");
    expect(readFileSync(config, "utf8")).toContain("**/app/**");
    expect(readFileSync(config, "utf8")).toContain("ATELIER_VITE_PORT");
    rmSync(join(dir, "public", "hot"));
    ensureViteHotFile(dir, "http://127.0.0.1:43123/-/p/tok/__vite");
    expect(readFileSync(join(dir, "public", "hot"), "utf8")).toBe("http://127.0.0.1:43123/-/p/tok/__vite");
  });
});
