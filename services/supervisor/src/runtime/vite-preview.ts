import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const VITE_PREVIEW_SEGMENT = "__vite";

export function publicViteOrigin(publicUrl: string): string {
  return `${publicUrl.replace(/\/$/, "")}/${VITE_PREVIEW_SEGMENT}`;
}

export function viteDevAssetPath(rest: string): string | null {
  const trimmed = rest.replace(/^\/+/, "");
  const prefix = `${VITE_PREVIEW_SEGMENT}/`;
  if (trimmed === VITE_PREVIEW_SEGMENT) return "/";
  if (trimmed.startsWith(prefix)) return `/${trimmed.slice(prefix.length)}`;
  if (/^(?:@vite(?:\/|$)|@fs\/|@id\/|@url\/|resources\/|node_modules\/|__vite_ping)/.test(trimmed)) {
    return `/${trimmed}`;
  }
  return null;
}

export function writeViteHotFile(worktree: string, origin: string): void {
  const hot = join(worktree, "public", "hot");
  mkdirSync(dirname(hot), { recursive: true });
  writeFileSync(hot, origin.replace(/\/$/, ""));
}

export function writeViteAtelierConfig(worktree: string): string {
  const dest = join(worktree, ".cursor", "vite.atelier.mjs");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    `import { defineConfig } from "vite";

export default defineConfig(async (env) => {
  const mod = await import("../vite.config.ts");
  const factory = mod.default;
  const raw = typeof factory === "function" ? await factory(env) : factory;
  const plugins = (raw.plugins ?? []).flat().filter((plugin) => plugin?.name !== "@laravel/vite-plugin-wayfinder");
  return {
    ...raw,
    plugins,
    server: {
      ...raw.server,
      host: "127.0.0.1",
      port: Number(process.env.ATELIER_VITE_PORT || 5173),
      strictPort: true,
      origin: process.env.ATELIER_VITE_ORIGIN,
      hmr: false,
    },
  };
});
`,
  );
  return dest;
}
