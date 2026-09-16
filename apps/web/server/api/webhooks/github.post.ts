import { ensureGitHubWebhookSecret, verifyGitHubWebhookSignature } from "@atelier/supervisor";
import { platform } from "../../utils/platform";

export default defineEventHandler(async (event) => {
  const raw = await readRawBody(event);
  if (raw == null) throw createError({ statusCode: 400, statusMessage: "empty webhook body" });
  const secret = ensureGitHubWebhookSecret();
  const signature = getHeader(event, "x-hub-signature-256");
  if (!verifyGitHubWebhookSignature(raw, secret, signature)) {
    throw createError({ statusCode: 401, statusMessage: "invalid webhook signature" });
  }

  const body = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8")) as {
    zen?: string;
    action?: string;
    member?: { login?: string };
  };
  if (body.zen) return { ok: true, ping: true };
  if (body.action === "removed" && body.member?.login) {
    platform().store.update((db) => {
      const user = db.users.find((u) => u.login === body.member?.login);
      if (user) db.members = db.members.filter((m) => m.userId !== user.id);
    });
  }
  return { ok: true };
});
