import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    workspaceId: string;
    sessionId?: string;
    source: "laravel" | "vite" | "console" | "network" | "preview";
    message: string;
    stack?: string;
  }>(event);
  const ws = platform().store.read().workspaces.find((row) => row.id === body.workspaceId);
  if (!ws) throw createError({ statusCode: 404 });
  platform().reportPreviewError(body.workspaceId, body.sessionId, body);
  return { ok: true };
});
