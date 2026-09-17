import { requirePlatformAdmin } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  requirePlatformAdmin(event);
  const body = await readBody<{
    id: string;
    enabled?: boolean;
    apiKey?: string;
    label?: string;
    model?: string;
    keyRef?: string;
    keyEnabled?: boolean;
    keyLabel?: string;
    moveKey?: "up" | "down";
    resetKey?: boolean;
    deleteKey?: boolean;
  }>(event);
  if (!body.id) throw createError({ statusCode: 400, statusMessage: "id required" });
  return { providers: platform().saveProviderSettings(body) };
});
