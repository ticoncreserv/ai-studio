import { platform, userFromEvent } from "../utils/platform";

export default defineEventHandler((event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  return platform().createInvite(user);
});
