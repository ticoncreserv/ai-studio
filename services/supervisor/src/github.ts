import { createSign } from "node:crypto";

export function appJwt(appId: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign(privateKey, "base64url");
  return `${header}.${payload}.${sig}`;
}

export async function installationToken(appId: string, privateKey: string, installationId: string): Promise<string> {
  const jwt = appJwt(appId, privateKey);
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/vnd.github+json", "User-Agent": "atelier" },
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("installation token failed");
  return body.token;
}

export async function resolveInstallationToken(input: {
  appId?: string;
  privateKey?: string;
  installationId?: string;
}): Promise<string | null> {
  const appId = input.appId || process.env.GITHUB_APP_ID;
  const privateKey = (input.privateKey || process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const installationId = input.installationId || process.env.GITHUB_INSTALLATION_ID;
  if (!appId || !privateKey || !installationId) return null;
  return installationToken(appId, privateKey, installationId);
}
