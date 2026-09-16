import { requireUser } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  if (platform().roleFor(user) !== "owner") throw createError({ statusCode: 403, statusMessage: "forbidden" });
  const body = await readBody<Record<string, boolean>>(event);
  platform().store.update((db) => {
    db.flags = { ...db.flags, ...body };
  });
  return platform().flags();
});
