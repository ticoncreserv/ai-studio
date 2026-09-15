import { ClientCommandSchema } from "@atelier/contracts";
import { platform, userFromEvent } from "../../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = userFromEvent(event);
  if (!user) throw createError({ statusCode: 401 });
  const sessionId = getRouterParam(event, "id")!;
  const body = await readBody<{ command: unknown; spectator?: boolean }>(event);
  const command = ClientCommandSchema.parse(body.command);
  await platform().handleCommand({ user, sessionId, command, spectator: body.spectator });
  return { ok: true, snapshot: platform().snapshot(sessionId) };
});
