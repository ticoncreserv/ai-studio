import { createHmac, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyGitHubAppCredentials,
  atelierCanonicalOrigin,
  atelierPublicUrl,
  credentialsFromManifestResponse,
  githubAppAuthorizeRedirectUri,
  githubAppCreateAction,
  githubAppInstallUrl,
  githubAppRegisteredCallbackUrls,
  githubOAuthRedirectCandidates,
  oauthRedirectUriForIncomingHost,
  ensureGitHubWebhookSecret,
  githubAppManifest,
  redeemGitHubAppCode,
  syncGitHubAppPublicUrls,
  verifyGitHubWebhookSignature,
  saveGitHubAppCredentials,
  loadGitHubAppCredentials,
  githubRepoOwnerLogin,
} from "./github-app.js";

const envKeys = [
  "GITHUB_APP_ID",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "ATELIER_PUBLIC_URL",
  "ATELIER_INCLUDE_LOOPBACK_CALLBACKS",
];

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
});

afterEach(() => {
  for (const key of envKeys) delete process.env[key];
});

describe("github app manifest", () => {
  it("pre-fills Atelier URLs and never asks for Administration", () => {
    const manifest = githubAppManifest("http://127.0.0.1:43123");
    expect(manifest.callback_urls).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:43123/api/auth/github/callback",
        "http://localhost:43123/api/auth/github/callback",
        "http://localhost/api/auth/github/callback",
        "http://127.0.0.1/api/auth/github/callback",
      ]),
    );
    expect(manifest.callback_urls.length).toBeLessThanOrEqual(10);
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
    expect(atelierPublicUrl("localhost:")).toBe("http://localhost:43123");
    expect(atelierPublicUrl("localhost:80")).toBe("http://localhost:43123");
    expect(atelierPublicUrl("127.0.0.1:43123")).toBe("http://127.0.0.1:43123");
    expect(atelierPublicUrl("preview.example", "https")).toBe("https://preview.example");
    expect(atelierPublicUrl("atelier.example.com:443", "https")).toBe("https://atelier.example.com");
  });

  it("uses a dedicated production domain instead of the listen port", () => {
    process.env.ATELIER_PUBLIC_URL = "https://atelier.example.com";
    expect(atelierCanonicalOrigin("http://127.0.0.1:43123")).toBe("https://atelier.example.com");
    expect(githubAppAuthorizeRedirectUri("http://127.0.0.1:43123")).toBe(
      "https://atelier.example.com/api/auth/github/callback",
    );
    expect(githubAppRegisteredCallbackUrls("http://127.0.0.1:43123")).toEqual([
      "https://atelier.example.com/api/auth/github/callback",
    ]);
    expect(githubAppManifest("http://127.0.0.1:43123")).toMatchObject({
      url: "https://atelier.example.com",
      redirect_url: "https://atelier.example.com/api/setup/github/callback",
      setup_url: "https://atelier.example.com/setup/github",
      hook_attributes: { url: "https://atelier.example.com/api/webhooks/github", active: false },
    });
    expect(githubOAuthRedirectCandidates()[0]).toBe("https://atelier.example.com/api/auth/github/callback");
    expect(githubOAuthRedirectCandidates()).not.toContain("http://localhost/api/auth/github/callback");
  });

  it("keeps the portless localhost callback GitHub already stored", () => {
    expect(githubAppAuthorizeRedirectUri("http://127.0.0.1:43123")).toBe(
      "http://localhost/api/auth/github/callback",
    );
    expect(githubAppAuthorizeRedirectUri("https://atelier.example")).toBe(
      "https://atelier.example/api/auth/github/callback",
    );
    expect(oauthRedirectUriForIncomingHost("localhost")).toBe("http://localhost/api/auth/github/callback");
    expect(oauthRedirectUriForIncomingHost("localhost:")).toBe("http://localhost/api/auth/github/callback");
    expect(oauthRedirectUriForIncomingHost("localhost:80")).toBe("http://localhost/api/auth/github/callback");
    expect(oauthRedirectUriForIncomingHost("127.0.0.1:43123")).toBe(
      "http://127.0.0.1:43123/api/auth/github/callback",
    );
    expect(githubAppRegisteredCallbackUrls()).toEqual(
      expect.arrayContaining([
        "http://localhost/api/auth/github/callback",
        "http://127.0.0.1:43123/api/auth/github/callback",
      ]),
    );
    expect(githubOAuthRedirectCandidates("http://127.0.0.1:43123/api/auth/github/callback")[0]).toBe(
      "http://127.0.0.1:43123/api/auth/github/callback",
    );
    expect(githubOAuthRedirectCandidates()).toContain("http://localhost/api/auth/github/callback");
    expect(githubOAuthRedirectCandidates()).toContain("http://localhost:/api/auth/github/callback");
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

  it("PATCHes the GitHub App with every loopback callback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gh-"));
    const path = join(dir, "github-app.json");
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    saveGitHubAppCredentials(
      {
        appId: "4965566",
        clientId: "Iv1.keep",
        clientSecret: "keep",
        privateKey,
        webhookSecret: "hook",
        slug: "atelier-keep",
      },
      path,
    );
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const ok = await syncGitHubAppPublicUrls(loadGitHubAppCredentials(path), async (url, init) => {
      seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("{}", { status: 200 });
    });
    expect(ok).toBe(true);
    expect(seen[0]?.url).toBe("https://api.github.com/app");
    expect(seen[0]?.body.callback_urls).toEqual(
      expect.arrayContaining([
        "http://localhost/api/auth/github/callback",
        "http://127.0.0.1:43123/api/auth/github/callback",
      ]),
    );
  });

  it("resolves the GitHub repository owner login from the installation or repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "atelier-gh-"));
    const path = join(dir, "github-app.json");
    const previous = process.env.ATELIER_REPO;
    try {
      delete process.env.ATELIER_REPO;
      expect(githubRepoOwnerLogin(join(dir, "missing.json"))).toBe("ticoncreserv");
      saveGitHubAppCredentials(
        {
          appId: "1",
          clientId: "Iv1.keep",
          clientSecret: "keep",
          privateKey: "pem",
          webhookSecret: "hook",
        },
        path,
      );
      expect(githubRepoOwnerLogin(path)).toBe("ticoncreserv");
      saveGitHubAppCredentials(
        {
          appId: "1",
          clientId: "Iv1.keep",
          clientSecret: "keep",
          privateKey: "pem",
          webhookSecret: "hook",
          ownerLogin: "ada",
        },
        path,
      );
      expect(githubRepoOwnerLogin(path)).toBe("ada");
      expect(loadGitHubAppCredentials(path)?.ownerLogin).toBe("ada");
      process.env.ATELIER_REPO = "octocat/hello";
      expect(githubRepoOwnerLogin(join(dir, "other.json"))).toBe("octocat");
    } finally {
      if (previous === undefined) delete process.env.ATELIER_REPO;
      else process.env.ATELIER_REPO = previous;
    }
  });
});
