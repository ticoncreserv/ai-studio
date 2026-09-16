import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const ws = platform().resolveShare(getRouterParam(event, "token")!);
  if (!ws) throw createError({ statusCode: 404 });
  const workspace = await platform().wakePreview(ws.id).catch(() => ws);
  return { workspace, previewPath: `/-/p/${workspace.previewToken}/` };
});
