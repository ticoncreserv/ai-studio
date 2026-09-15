import { platform, userFromEvent } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  await platform().hibernate(getRouterParam(event, "id")!);
  return { ok: true };
});
