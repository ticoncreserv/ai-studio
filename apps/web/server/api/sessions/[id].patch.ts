import type { ProviderId } from "@atelier/contracts";
import { platform, userFromEvent } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const body = await readBody<{ provider: ProviderId }>(event);
  return platform().setSessionProvider(getRouterParam(event, "id")!, body.provider);
});
