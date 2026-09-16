import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyGitHubAppCredentials,
  atelierPublicUrl,
  credentialsFromManifestResponse,
  githubAppCreateAction,
  githubAppInstallUrl,
  ensureGitHubWebhookSecret,
  githubAppManifest,
  redeemGitHubAppCode,
  verifyGitHubWebhookSignature,
  saveGitHubAppCredentials,
  loadGitHubAppCredentials,
} from "./github-app.js";

const envKeys = [
  "GITHUB_APP_ID",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
];

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe("github app manifest", () => {
  it("pre-fills Atelier URLs and never asks for Administration", () => {
    const manifest = githubAppManifest("http://127.0.0.1:43123");
    expect(manifest.callback_urls).toEqual(["http://127.0.0.1:43123/api/auth/github/callback"]);
    expect(manifest.redirect_url).toBe("http://127.0.0.1:43123/api/setup/github/callback");
    expect(manifest.public).toBe(false);
    expect(manifest.request_oauth_on_install).toBe(true);
    expect(manifest.default_permissions).toEqual({
      contents: "write",
      metadata: "read",
      pull_requests: "write",
      emails: "read",
    });
    expect(JSON.stringify(manifest)).not.toContain("administration");
    expect(manifest.hook_attributes).toEqual({
      url: "http://127.0.0.1:43123/api/webhooks/github",
      active: false,
    });
    expect(githubAppCreateAction("ticoncreserv", "abc")).toBe(
      "https://github.com/organizations/ticoncreserv/settings/apps/new?state=abc",
    );
  });

  it("creates and verifies a webhook secret", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gh-"));
    const path = join(dir, "github-app.json");
    saveGitHubAppCredentials(
      {
        appId: "1",
        clientId: "Iv1.keep",
        clientSecret: "keep",
        privateKey: "pem",
        webhookSecret: "",
        slug: "atelier-keep",
      },
      path,
    );
    const secret = ensureGitHubWebhookSecret(path);
    expect(secret).toHaveLength(64);
    expect(loadGitHubAppCredentials(path)?.webhookSecret).toBe(secret);
    const body = '{"ok":true}';
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubWebhookSignature(body, secret, signature)).toBe(true);
    expect(verifyGitHubWebhookSignature(body, secret, "sha256=deadbeef")).toBe(false);
  });

  it("keeps the studio port on loopback hosts", () => {
    expect(atelierPublicUrl("localhost")).toBe("http://localhost:43123");
    expect(atelierPublicUrl("localhost:80")).toBe("http://localhost:43123");
    expect(atelierPublicUrl("127.0.0.1:43123")).toBe("http://127.0.0.1:43123");
    expect(atelierPublicUrl("preview.example", "https")).toBe("https://preview.example");
  });

  it("maps the manifest conversion payload and persists it", () => {
    const creds = credentialsFromManifestResponse({
      id: 99,
      slug: "atelier-concreserv",
      html_url: "https://github.com/apps/atelier-concreserv",
      client_id: "Iv1.abc",
      client_secret: "s3cret",
      pem: "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----",
      webhook_secret: "hook",
    });
    expect(creds.clientId).toBe("Iv1.abc");
    expect(githubAppInstallUrl(creds)).toBe("https://github.com/apps/atelier-concreserv/installations/new");

    const dir = mkdtempSync(join(tmpdir(), "atelier-gh-"));
    const path = join(dir, "github-app.json");
    saveGitHubAppCredentials(creds, path);
    expect(loadGitHubAppCredentials(path)?.clientSecret).toBe("s3cret");
    expect(readFileSync(path, "utf8")).toContain("Iv1.abc");

    applyGitHubAppCredentials(creds);
    expect(process.env.GITHUB_CLIENT_ID).toBe("Iv1.abc");
    process.env.GITHUB_CLIENT_ID = "keep-env";
    applyGitHubAppCredentials(creds);
    expect(process.env.GITHUB_CLIENT_ID).toBe("keep-env");
  });

  it("keeps stored credentials when GitHub rejects a used code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gh-"));
    const path = join(dir, "github-app.json");
    saveGitHubAppCredentials(
      {
        appId: "1",
        clientId: "Iv1.keep",
        clientSecret: "keep",
        privateKey: "pem",
        webhookSecret: "",
        slug: "atelier-keep",
      },
      path,
    );
    const result = await redeemGitHubAppCode(
      "used-code",
      async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
      path,
    );
    expect(result.reused).toBe(true);
    expect(result.creds.clientId).toBe("Iv1.keep");
  });
});
