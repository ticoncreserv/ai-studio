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
- `packages/db` — future Drizzle/Postgres schema. The running studio does not need `DATABASE_URL` or `REDIS_URL`; it persists to `var/platform.json` and runs jobs in-process.

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

Production uses a GitHub App (user-to-server token, no `Administration` scope). Access is `GET /repos/ticoncreserv/app` with that token. Without `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, local login is used.

### Create the GitHub App

You need to be an owner of the `ticoncreserv` organization. The studio can create the app through GitHub’s manifest flow:

1. Open [http://127.0.0.1:43123/setup/github](http://127.0.0.1:43123/setup/github) while the studio is running.
2. Click **Create GitHub App on ticoncreserv**. GitHub shows the pre-filled manifest (homepage, callback, permissions).
3. Confirm the app. GitHub redirects the **browser** to `{origin}/api/setup/github/callback`. The studio answers that path on `127.0.0.1:43123`, `localhost:43123`, `localhost:8080`, and `http://localhost` (port 80). If a leftover GitHub URL still 404s, paste the `code` query into `/setup/github`. Atelier stores `client_id`, `client_secret`, App ID, private key, and webhook secret in `var/github-app.json` (gitignored) and loads them into the current process.
4. Install the app **only** on `ticoncreserv/app`. Do not grant `Administration`. After install or sign-in GitHub redirects to the **Callback URL**. Locally the authorize flow uses `http://localhost/api/auth/github/callback` and the loopback proxy forwards it to the listen port. In production set `ATELIER_PUBLIC_URL=https://your-domain` and register `{ATELIER_PUBLIC_URL}/api/auth/github/callback`.
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

There is no in-app `.env` editor. Two files matter:

| File | What it configures |
| --- | --- |
| `.env` at the Atelier repo root | Platform: `ATELIER_PUBLIC_URL`, GitHub App/OAuth, `CURSOR_API_KEY`. Restart `pnpm dev` after changes. |
| `var/workspaces/{workspaceId}/.env` | Cloned `ticoncreserv/app` secrets (MySQL/SQL Server hosts, mail, etc.). Edit on disk, then **Resume preview**. |

Workspace settings in the studio lists the worktree path and the isolation overlay. On every preview start the studio overwrites `APP_URL`, `SESSION_COOKIE`, `QUEUE_NAME`, and `CACHE_PREFIX` so workspaces do not collide. Homologation `10.x` hosts stay as they are in the cloned file.

`DATABASE_URL` and `REDIS_URL` in the platform `.env` are unused (JSON store + in-process queue).

## Preview

`ProcessRuntime` clones `ticoncreserv/app` (cached bare clone in `var/cache`), writes a worktree `.env` from `.env.example` plus isolation, runs `composer install` / `npm install` when needed, then `php artisan serve` on a free loopback port. Vite runs in **dev mode** on a second loopback port (not a production `public/build` manifest). Laravel reads `public/hot` as `/-/p/{token}/__vite` (host-relative, so `localhost` and `127.0.0.1` stay same-origin). The proxy rewrites Vite's root imports (`/node_modules`, `/resources`) onto that prefix so the browser does not hit Nuxt. The Wayfinder plugin is not allowed to block Vite listen — `npm run wayfinder:generate` runs in the background. Health is `GET /up`. `APP_URL` is `{ATELIER_PUBLIC_URL}/-/p/{previewToken}` so CSRF, redirects, and Inertia stay on the studio origin.

`/-/p/{token}` proxies Laravel. `/-/p/{token}/__vite` proxies the Vite dev server (method, query, body, cookies, CSRF). `Set-Cookie` `Path` is rewritten onto the iframe prefix. Hibernate clears both ports. Opening `/w/:id` or a share link wakes the preview. While artisan, Vite, or Inertia is still working, the preview chrome and the Laravel HTML show a spinner, elapsed time, and a short reason — the iframe is not left blank.

`DockerRuntime` (`ATELIER_RUNTIME=docker`) uses `infra/workspace-php85.Dockerfile` when the daemon exists. Database hosts from the cloned `.env` are used as-is; unreachable `10.x` homologation hosts surface as Laravel errors, not a fake portal.

## ACP

`agent acp --trust` is the only production provider. The process stays up across prompts (`session/load` + stored `acpSessionId`). Mode is `--mode plan|ask`. Worktree `.cursor/mcp.json` (Laravel Boost) is passed to `session/new`. Permissions are shown in the UI before `acp.respond`. After each run the studio reads `git status` / diff from the worktree — Cursor writes files directly.

## Feature flags

`publish`, `multiProvider`, `spectator`, and `recipes` live in the platform store and can be flipped without a deploy.
