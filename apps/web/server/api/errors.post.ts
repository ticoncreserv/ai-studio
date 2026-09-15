import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    workspaceId: string;
    sessionId?: string;
    source: "laravel" | "vite" | "console" | "network" | "preview";
    message: string;
    stack?: string;
  }>(event);
  platform().reportPreviewError(body.workspaceId, body.sessionId, body);
  return { ok: true };
});
