import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ action?: string; member?: { login?: string } }>(event);
  if (body.action === "removed" && body.member?.login) {
    platform().store.update((db) => {
      const user = db.users.find((u) => u.login === body.member?.login);
      if (user) db.members = db.members.filter((m) => m.userId !== user.id);
    });
  }
  return { ok: true };
});
