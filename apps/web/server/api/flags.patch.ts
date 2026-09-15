import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const body = await readBody<Record<string, boolean>>(event);
  platform().store.update((db) => {
    db.flags = { ...db.flags, ...body };
  });
  return platform().flags();
});
