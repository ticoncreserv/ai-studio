import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  const ws = platform().resolveShare(getRouterParam(event, "token")!);
  if (!ws) throw createError({ statusCode: 404 });
  return { workspace: ws, previewPath: `/-/p/${ws.previewToken}/` };
});
