import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  const key = getQuery(event).reveal?.toString();
  if (key) return { key, value: platform().revealUserEnvKey(user.id, key) };
  return platform().getUserEnv(user.id);
});
