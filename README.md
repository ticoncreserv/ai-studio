# Atelier

Self-hosted studio for assisted creation on `github.com/ticoncreserv/app` (Laravel 13 + Inertia + Vue). A signed-in GitHub user gets a personal branch (`user/{login}/studio`), a Cursor ACP session, and a live Laravel preview in mobile, tablet, and desktop viewports.

This repository is the **platform**. The target app stays in `ticoncreserv/app`. Production needs a GitHub App (clone + push) and `CURSOR_API_KEY` (prompts). `fixtures/laravel-app` and `MockProvider` exist only for tests, eval, and SLO checks.

## Stack

- Node 24 LTS (see `.nvmrc`)
- TypeScript 6 (the 7.x compiler has no API yet; `typescript-eslint` and `vue-tsc` still need 6)
- `apps/web` — Nuxt 4 + Nitro + Vue 3 + Tailwind CSS v4 + i18n (`pt-BR` default, `en`)
- `services/supervisor` — ACP sessions, GitHub clone, Laravel preview, reconciler
- `packages/contracts` — Zod events and commands
- `packages/domain` — pure reducer, FSM, rules, permissions, schema guard
- `packages/db` — Drizzle schema for a future Postgres primary. Default persist is `var/platform.json`. `ATELIER_STORE=postgres|shadow` (or flags `postgresStore` / `postgresShadowRead`) writes a flattened snapshot to `var/platform.pg.json` until a live `DATABASE_URL` exists. Jobs still run in-process.

## Run locally

```bash
nvm use
corepack enable
pnpm install
pnpm dev
```

Required in `.env` before opening a workspace:

- GitHub App: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID` (or `var/github-app.json` from `/setup/github`)
- Cursor: `CURSOR_API_KEY`
- Optional extra agents (off by default): `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `XAI_API_KEY`
- Public origin: `ATELIER_PUBLIC_URL` (preview `APP_URL` and OAuth callbacks)

Locally the web app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). That port is only the current bind — production uses `ATELIER_PUBLIC_URL` as a dedicated https origin. `pnpm dev` also answers on `http://localhost` (port 80) and `http://localhost:8080` so local GitHub callbacks that omit the port do not 404.

The cloned app requires **PHP 8.5** (`php ^8.5` in `composer.json`). This host needs `php8.5-cli` plus `mbstring`, `xml`, `curl`, `zip`, `gd`, `intl`, `bcmath`, `mysql`, and Composer. On Ubuntu 24.04:

```bash
sudo add-apt-repository -y ppa:ondrej/php
sudo apt-get install -y php8.5-cli php8.5-mbstring php8.5-xml php8.5-curl php8.5-zip \
  php8.5-gd php8.5-intl php8.5-bcmath php8.5-mysql php8.5-ldap php8.5-sqlite3
curl -sS https://getcomposer.org/installer | php -- --install-dir="$HOME/.local/bin" --filename=composer
```

Without PHP, preview fails on `GET /up` with a real error — not fixture HTML. After PHP and `composer install` are in place, **Resume preview** starts `php artisan serve` again (the workspace can leave `error` and go back to `running`). Set `ATELIER_RUNTIME=docker` only when the daemon and `infra/workspace-php85.Dockerfile` image are available. Homologation databases in the cloned `.env` (`10.x`) are used as-is; `/up` does not need them, but login and screens will fail if those hosts are unreachable.

```bash
pnpm test
pnpm i18n:check
pnpm eval
```

## Auth

Studio login is always GitHub (user-to-server token, no `Administration` scope). Access is `GET /repos/ticoncreserv/app` with that token. There is no local username login.

### Create the GitHub App

You need to be an owner of the `ticoncreserv` organization. The login page does not link to setup. Enable the manifest flow with `ATELIER_ALLOW_GITHUB_APP_SETUP=1`, then open `/setup/github` directly (or **Admin → GitHub App setup** after an admin is signed in). Turn the flag off when credentials are stored.

1. Open [http://127.0.0.1:43123/setup/github](http://127.0.0.1:43123/setup/github) while the studio is running and the flag is on.
2. Click **Create GitHub App on ticoncreserv**. GitHub shows the pre-filled manifest (homepage, callback, permissions).
3. Confirm the app. GitHub redirects the **browser** to `{origin}/api/setup/github/callback`. The studio answers that path on `127.0.0.1:43123`, `localhost:43123`, `localhost:8080`, and `http://localhost` (port 80). If a leftover GitHub URL still 404s, paste the `code` query into `/setup/github`. Atelier stores `client_id`, `client_secret`, App ID, private key, and webhook secret in `var/github-app.json` (gitignored) and loads them into the current process.
4. Install the app **only** on `ticoncreserv/app`. Do not grant `Administration`. After install or sign-in GitHub redirects to the **Callback URL**. Locally the authorize flow uses the origin you opened (usually `http://127.0.0.1:43123/api/auth/github/callback`, which matches `ATELIER_PUBLIC_URL`). Token exchange sends that same `redirect_uri` from OAuth `state`. The loopback proxy on port 80 is only a fallback for leftover `http://localhost` callbacks. In production set `ATELIER_PUBLIC_URL=https://your-domain` and register `{ATELIER_PUBLIC_URL}/api/auth/github/callback`.
5. Copy the values into `.env` if you want them to survive a restart or another host (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID`, `GITHUB_WEBHOOK_SECRET`).

Manual path: GitHub → Organization settings → Developer settings → GitHub Apps → New GitHub App.

| Field | Value |
| --- | --- |
| Homepage URL | `ATELIER_PUBLIC_URL` — locally `http://127.0.0.1:43123`, in production `https://your-domain` |
| Callback URL | `{ATELIER_PUBLIC_URL}/api/auth/github/callback` (plus localhost variants only while developing) |
| Setup URL | `{ATELIER_PUBLIC_URL}/setup/github` |
| Permissions | `contents` read/write, `metadata` read, `pull requests` read/write, `email addresses` read |
| Webhook URL | `{origin}/api/webhooks/github` (inactive until the URL is public) |
| Webhook secret | `GITHUB_WEBHOOK_SECRET` — HMAC for `X-Hub-Signature-256` |
| Where can this GitHub App be installed | Only on this account |

A GitHub OAuth App also covers login. Same callback URL; only `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are required.

Cursor ACP is a different credential. Set `CURSOR_API_KEY` in `.env`. The studio strips any inherited Origin-scoped `CURSOR_AUTH_TOKEN` before spawning `agent acp`. Without a key, the studio shows an error — it does not fall back to Mock.

Commits in a workspace set `user.name` / `user.email` and `commit.gpgsign=false` per invocation.

## Environment files

Three Laravel layers sit under the platform `.env`:

| File | What it configures |
| --- | --- |
| `.env` at the Atelier repo root | Platform: `ATELIER_PUBLIC_URL`, GitHub App/OAuth, `CURSOR_API_KEY`, optional `ATELIER_ADMIN_LOGINS`. Restart `pnpm dev` after changes. Not merged into clones. |
| `var/env/global.env` | Shared `ticoncreserv/app` secrets for every clone. Edited in `/admin`. |
| `var/env/users/{userId}.env` | Per-user overlay. Edited in workspace settings. Overrides the shared file. |
| `var/workspaces/{workspaceId}/.env` | Generated file Laravel reads. Isolation (`APP_URL`, `SESSION_COOKIE`, prefixes) always wins. |

On every preview start the studio writes the worktree `.env` as `.env.example` → global → user overlay → isolation. Homologation `10.x` hosts stay as they are in those layers. `REDIS_URL` is unused (in-process queue). `DATABASE_URL` is unused unless the postgres store is selected; without a live SQL host the studio writes `var/platform.pg.json`.

## Admin

`/admin` is for platform admins: shared `.env`, providers, users, global rules (`AGENTS.md` prefix), global skills, MCP servers and policy, flags, and the workspace fleet.

A user is a platform admin when their login is in `ATELIER_ADMIN_LOGINS`, or `platformAdmin` is set on their record, or **no explicit admin exists yet** and they are a GitHub `owner`. After the first admin is granted in the panel, other owners do not get the panel automatically. The last admin cannot be removed.

## Preview

`ProcessRuntime` clones `ticoncreserv/app` (cached bare clone in `var/cache`), writes a worktree `.env` from `.env.example` plus the shared/user layers and isolation, runs `composer install` / `npm install` when needed, then `php artisan serve` on a free loopback port. Vite runs in **dev mode** on a second loopback port (not a production `public/build` manifest). Laravel reads `public/hot` as `/-/p/{token}/__vite` (host-relative, so `localhost` and `127.0.0.1` stay same-origin). The proxy rewrites Vite's root imports (`/node_modules`, `/resources`) onto that prefix so the browser does not hit Nuxt. The Wayfinder plugin is not allowed to block Vite listen — `npm run wayfinder:generate` runs in the background. Health is `GET /up`. `APP_URL` is `{ATELIER_PUBLIC_URL}/-/p/{previewToken}` so CSRF, redirects, and Inertia stay on the studio origin.

`/-/p/{token}` proxies Laravel. `/-/p/{token}/__vite` proxies the Vite dev server (method, query, body, cookies, CSRF). `Set-Cookie` `Path` is rewritten onto the iframe prefix. Hibernate clears both ports. Opening `/w/:id` or a share link wakes the preview. While artisan, Vite, or Inertia is still working, the preview chrome and the Laravel HTML show a spinner, elapsed time, and a short reason — the iframe is not left blank.

`DockerRuntime` (`ATELIER_RUNTIME=docker`) uses `infra/workspace-php85.Dockerfile` when the daemon exists. Database hosts from the cloned `.env` are used as-is; unreachable `10.x` homologation hosts surface as Laravel errors, not a fake portal.

## Skills and MCP

The cloned repository is the source of truth. Atelier discovers `SKILL.md` folders under `.agents/skills`, `.cursor/skills`, `.claude/skills`, and `.codex/skills`, plus `.cursor/mcp.json`. It never rewrites repository files it did not create.

Platform (`/admin`) and user (workspace sheets) layers live under `var/skills` and `var/mcp`. On provision they are materialized into the gitignored worktree `.cursor/skills` and merged into `.cursor/mcp.json` (repository keys win; disabled servers are omitted). Type `/` in the composer to invoke a skill. The Tools submenu toggles MCP servers. `laravel-boost` is a seeded global default so Boost still reaches `session/new` without clobbering a repo-provided config.

## ACP

Cursor (`agent --trust acp`) is the default production provider. Claude (`npx -y @agentclientprotocol/claude-agent-acp`), Gemini (`gemini --acp`), and Grok (`grok --no-auto-update agent stdio`) share the same JSON-RPC client (`initialize` / `authenticate` / `session/new|load|prompt`, `session/cancel` as a notification). Extra providers stay off until `/admin` turns on `multiProvider` plus `claudeProvider` / `geminiProvider` / `grokProvider`, the admin enables the row, and the CLI plus API key exist. `providerCanary` keeps extra agents out of workspace pickers unless `ATELIER_PROVIDER_CANARY=1`.

The process stays up across prompts (`session/load` + stored `acpSessionId`). Mode is `--mode plan|ask` when the agent advertises those modes. Merged MCP servers from the worktree are passed to `session/new` (stdio always; `http`/`sse` when the agent advertises those capabilities). Slash commands advertised by the agent (`available_commands_update`) appear in the `/` menu. Permissions are shown in the UI before `acp.respond`. After each run the studio reads `git status` / diff from the worktree.

Sandbox profiles: `disabled` when `sandboxedAgent` is off, `best-effort` (default) wraps with bubblewrap or `ATELIER_SANDBOX_IMAGE` when present, `required` (`sandboxRequired` or `ATELIER_SANDBOX_PROFILE=required`) fails closed if no backend exists. Host secrets are stripped from the agent env except the selected provider key.

## Feature flags

Flags live in the platform store and are flipped in `/admin` without a deploy. Defaults stay off for `publish`, extra providers, postgres, required sandbox, live evals, and auto-push.

Live ACP evals (`pnpm eval`) stay on transcript + worktree gold unless `ATELIER_LIVE_EVAL=1`. Missing CLIs skip instead of failing CI.
