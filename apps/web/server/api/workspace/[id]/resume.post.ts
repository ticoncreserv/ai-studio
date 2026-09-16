import { platform, userFromEvent } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const workspace = await platform().startPreview(getRouterParam(event, "id")!);
  return { workspace };
});
