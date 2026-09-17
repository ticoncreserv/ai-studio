import { requireUser } from "../../utils/authz";
import { platform } from "../../utils/platform";

export default defineEventHandler((event) => {
  const user = requireUser(event);
  return { usage: platform().usageSummary(user.id) };
});
