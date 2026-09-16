import { requireInvite } from "../utils/authz";
import { platform } from "../utils/platform";

export default defineEventHandler((event) => {
  const user = requireInvite(event);
  return platform().createInvite(user);
});
