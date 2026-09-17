import { describe, expect, it } from "vitest";
import { createAuthProvider, GitHubAuthProvider, parseOAuthState, signState, verifyState } from "./auth.js";
import { signSession, verifySession } from "./session-cookie.js";

const authorizeCallback = "http://localhost/api/auth/github/callback";
const incomingAfterProxy = "http://127.0.0.1:43123/api/auth/github/callback";

function mockGitHub(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(String(input), init);
  return () => {
    globalThis.fetch = original;
  };
}

describe("auth", () => {
  it("always uses GitHub for studio login", () => {
    const previousId = process.env.GITHUB_CLIENT_ID;
    const previousSecret = process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    try {
      expect(createAuthProvider().id).toBe("github");
    } finally {
      if (previousId === undefined) delete process.env.GITHUB_CLIENT_ID;
      else process.env.GITHUB_CLIENT_ID = previousId;
      if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET;
      else process.env.GITHUB_CLIENT_SECRET = previousSecret;
    }
  });

  it("issues a sealed session cookie", () => {
    const cookie = signSession("user-1");
    expect(verifySession(cookie)?.userId).toBe("user-1");
    expect(verifySession("tampered")).toBeNull();
  });

  it("round-trips signed oauth state", () => {
    const signed = signState("abc", "secret");
    expect(verifyState(signed, "secret")).toBe("abc");
    expect(verifyState(signed, "other")).toBeNull();
  });

  it("stores the authorize redirect_uri in state and omits scopes for GitHub Apps", async () => {
    for (const clientId of ["Iv1.example", "Iv23exampleClientId01"]) {
      const provider = new GitHubAuthProvider(clientId, "secret");
      const { url, state } = await provider.beginLogin("/", authorizeCallback);
      const parsed = new URL(url);
      expect(parsed.searchParams.get("redirect_uri")).toBe(authorizeCallback);
      expect(parsed.searchParams.get("scope")).toBeNull();
      expect(parseOAuthState(state)?.redirectUri).toBe(authorizeCallback);
    }
    expect(parseOAuthState("not-base64")).toBeNull();
  });

  it("keeps OAuth App scopes for non-GitHub-App client ids", async () => {
    const { url } = await new GitHubAuthProvider("0123456789abcdef0122", "secret").beginLogin("/");
    expect(new URL(url).searchParams.get("scope")).toBe("read:user user:email");
  });

  it("exchanges the code once with the authorize redirect_uri from state", async () => {
    const calls: Array<Record<string, string>> = [];
    const restore = mockGitHub(async (url, init) => {
      if (url.includes("access_token")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
        calls.push(body);
        if (body.redirect_uri === authorizeCallback) {
          return new Response(JSON.stringify({ access_token: "ghu_ok" }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "redirect_uri_mismatch" }), { status: 200 });
      }
      if (url.includes("/user/emails")) return new Response("[]", { status: 200 });
      if (url.endsWith("/user")) {
        return new Response(JSON.stringify({ login: "ada", name: "Ada", id: 1, email: null }), { status: 200 });
      }
      if (url.includes("/repos/")) {
        return new Response(JSON.stringify({ permissions: { push: true } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    try {
      const provider = new GitHubAuthProvider("Iv1.example", "secret");
      const { state } = await provider.beginLogin("/", authorizeCallback);
      const identity = await provider.completeLogin({
        code: "oauth-code",
        state,
        redirectUri: incomingAfterProxy,
      });
      expect(identity.login).toBe("ada");
      expect(identity.role).toBe("editor");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.redirect_uri).toBe(authorizeCallback);
      expect(calls[0]?.code).toBe("oauth-code");
    } finally {
      restore();
    }
  });
});
