# Atelier

Self-hosted studio for assisted creation on `github.com/ticoncreserv/app` (Laravel 13 + Inertia + Vue). A signed-in GitHub user gets a personal branch, a Cursor ACP session, and a live preview in mobile, tablet, and desktop viewports.

This repository is the **platform**. The target app stays in its own repo. Until GitHub App secrets exist, the studio runs against `fixtures/laravel-app` and a deterministic `MockProvider` that replays ACP transcripts.

## Stack

- Node 24 LTS (see `.nvmrc`)
- TypeScript 6 (the 7.x compiler has no API yet; `typescript-eslint` and `vue-tsc` still need 6)
- `apps/web` — Nuxt 4 + Nitro + Vue 3 + Tailwind CSS v4 + i18n (`en`, `pt-BR`)
- `services/supervisor` — ACP sessions, workspace runtime, reconciler
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

Locally the web app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). That port is only the current bind — production uses `ATELIER_PUBLIC_URL` as a dedicated https origin (no `:43123`). `pnpm dev` also answers on `http://localhost` (port 80) and `http://localhost:8080` and forwards those requests to the studio, so local GitHub callbacks that omit the port do not 404. Sign in with a local GitHub handle, open a workspace, and send a prompt. The mock agent proposes an Inertia quotes page; accept a hunk to write it into the worktree.

The studio exposes the product surfaces from the plan: session rail and search, agent/plan/ask modes, recipes, attachments, @-mentions, hunk/file review, plan/question/permission cards, rules editor, homologation connection catalog, schema-divergence banner, spectator mode, share/invite dialogs, feature flags, disk quota, and a three-viewport preview with inspect notes and a diagnostics overlay.

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
4. Install the app **only** on `ticoncreserv/app`. Do not grant `Administration`. After install or sign-in GitHub redirects to the **Callback URL**. Locally the authorize flow uses `http://localhost/api/auth/github/callback` (the URL already stored on the existing app) and the loopback proxy forwards it to the listen port. In production set `ATELIER_PUBLIC_URL=https://your-domain` and register `{ATELIER_PUBLIC_URL}/api/auth/github/callback` — the listen port is not part of that origin. Alias paths `/auth/github/callback` and `/github/callback` work on the same origins.
5. Copy the values into `.env` if you want them to survive a restart or another host (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`).

Manual path: GitHub → Organization settings → Developer settings → GitHub Apps → New GitHub App.

| Field | Value |
| --- | --- |
| Homepage URL | `ATELIER_PUBLIC_URL` — locally `http://127.0.0.1:43123`, in production `https://your-domain` |
| Callback URL | `{ATELIER_PUBLIC_URL}/api/auth/github/callback` (plus localhost variants only while developing) |
| Setup URL | `{ATELIER_PUBLIC_URL}/setup/github` |
| Permissions | `contents` read/write, `metadata` read, `pull requests` read/write, `email addresses` read |
| Webhook URL | `{origin}/api/webhooks/github` (inactive until the URL is public) |
| Webhook secret | `GITHUB_WEBHOOK_SECRET` — HMAC for `X-Hub-Signature-256`. Empty after the first create because the manifest had no hook; the studio now generates one and verifies deliveries. |
| Where can this GitHub App be installed | Only on this account |

A GitHub OAuth App also covers login. Same callback URL; only `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are required.

Cursor ACP is a different credential. Set `CURSOR_API_KEY` in `.env`. The studio strips any inherited Origin-scoped `CURSOR_AUTH_TOKEN` before spawning `agent acp`. Without a key, sessions stay on `MockProvider`.

Commits in a workspace set `user.name` / `user.email` and `commit.gpgsign=false` per invocation. The agent is recorded as `Co-authored-by`.

## Preview

`ProcessRuntime` serves the fixture through `scripts/preview-server.mjs`. `DockerRuntime` uses `infra/workspace-php85.Dockerfile` (`php:8.5-fpm` + Caddy, `pdo_dblib` + `pdo_odbc`/`msodbcsql18`, no `pdo_sqlsrv`, no `ext-redis`). Preview URLs in development: `/-/p/{token}`.

Side effects are forced off (`MAIL_MAILER=log`, integration flags false). Isolation env sets `SESSION_COOKIE`, `APP_URL`, `QUEUE_NAME`, `REDIS_PREFIX`, and `CACHE_PREFIX` per workspace.

## ACP

`agent acp` is the first provider. `CURSOR_API_KEY` authenticates the child process. An Origin-scoped `CURSOR_AUTH_TOKEN` on the host cannot be reused (`permission_denied` on `cursor_login`); that handshake is recorded in `fixtures/acp/initialize-handshake.ndjson`. Without a key, the studio uses `MockProvider`.

## Feature flags

`publish`, `multiProvider`, `spectator`, and `recipes` live in the platform store and can be flipped without a deploy.
