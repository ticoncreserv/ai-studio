import { createHmac, timingSafeEqual } from "node:crypto";

const secret = () => process.env.SESSION_SECRET ?? "atelier-dev-session-secret";

export function signSession(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifySession(value: string | undefined): { userId: string } | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 0) return null;
  const payload = value.slice(0, i);
  const mac = value.slice(i + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string };
    return parsed.userId ? { userId: parsed.userId } : null;
  } catch {
    return null;
  }
}
