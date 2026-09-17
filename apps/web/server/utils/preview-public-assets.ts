import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { proxyPreviewNode } from "./preview-proxy-core";

// Vite owns /-/p/* `?import` in `nuxt dev` and emits /_nuxt/@fs/__skip_vite, so
// Laravel images 404. Handle preview (and leftover /assets /resources) before Vite.
// Document HTML is rewritten here, including the Debugbar metrics script.
export function atelierLaravelPublicAssets(): Plugin {
  return {
    name: "atelier-laravel-public-assets",
    enforce: "pre",
    configureServer(server) {
      const handle = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const method = (req.method || "GET").toUpperCase();
        // Vite only steals GET `?import` / public files. POSTs (login, Inertia)
        // must reach Nitro so the request body is forwarded to Laravel.
        if (method !== "GET" && method !== "HEAD") {
          next();
          return;
        }
        void proxyPreviewNode(req, res)
          .then((handled) => {
            if (!handled) next();
          })
          .catch(() => next());
      };
      // `use()` here lands *before* Vite internals, then Nuxt splices a /__skip_vite
      // rewrite immediately in front of viteTransformMiddleware. Unshift after that
      // so `sec-fetch-dest: script` still hits Laravel instead of skip_vite.
      // Orphan `/assets` `/resources` GETs also land here, including Nuxt skip_vite
      // leftovers (`/_nuxt/@fs/__skip_vite/resources/...`) with studio Referer or cookie.
      return () => {
        server.middlewares.stack.unshift({ route: "", handle });
      };
    },
  };
}
