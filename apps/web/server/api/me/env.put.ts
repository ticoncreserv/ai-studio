import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await readBody<{ env?: Record<string, string>; raw?: string }>(event);
  return platform().saveUserEnv(user.id, body);
});
