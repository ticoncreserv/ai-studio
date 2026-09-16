# Atelier

Self-hosted studio for assisted creation on `github.com/ticoncreserv/app` (Laravel 13 + Inertia + Vue). A signed-in GitHub user gets a personal branch, a Cursor ACP session, and a live preview in mobile, tablet, and desktop viewports.

This repository is the **platform**. The target app stays in its own repo. Until GitHub App secrets exist, the studio runs against `fixtures/laravel-app` and a deterministic `MockProvider` that replays ACP transcripts.

## Stack

- Node 24 LTS (see `.nvmrc`)
- `apps/web` — Nuxt 4 + Nitro + Vue 3 + Tailwind CSS v4 + i18n (`en`, `pt-BR`)
- `services/supervisor` — ACP sessions, workspace runtime, reconciler
- `packages/contracts` — Zod events and commands
- `packages/domain` — pure reducer, FSM, rules, permissions, schema guard
- `packages/db` — Drizzle schema (Postgres when `DATABASE_URL` is set; JSON store otherwise)

## Run locally

```bash
nvm use
corepack enable
pnpm install
pnpm dev
```

The web app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). Sign in with a local GitHub handle, open a workspace, and send a prompt. The mock agent proposes an Inertia quotes page; accept a hunk to write it into the worktree.

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
3. Confirm the app. GitHub redirects back; Atelier stores `client_id`, `client_secret`, App ID, private key, and webhook secret in `var/github-app.json` (gitignored) and loads them into the current process.
4. Install the app **only** on `ticoncreserv/app`. Do not grant `Administration`.
5. Copy the values into `.env` if you want them to survive a restart or another host (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`).

Manual path: GitHub → Organization settings → Developer settings → GitHub Apps → New GitHub App.

| Field | Value |
| --- | --- |
| Homepage URL | `http://127.0.0.1:43123` (or `ATELIER_PUBLIC_URL`) |
| Callback URL | `{origin}/api/auth/github/callback` |
| Setup URL | `{origin}/setup/github` |
| Permissions | `contents` read/write, `metadata` read, `pull requests` read/write, `email addresses` read |
| Webhook | optional until the studio has a public URL |
| Where can this GitHub App be installed | Only on this account |

A GitHub OAuth App also covers login. Same callback URL; only `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are required.

Cursor ACP is a different credential. The GitHub App does not authenticate `cursor-agent`. Until a Cursor user token works, the studio uses `MockProvider`.

Commits in a workspace set `user.name` / `user.email` and `commit.gpgsign=false` per invocation. The agent is recorded as `Co-authored-by`.

## Preview

`ProcessRuntime` serves the fixture through `scripts/preview-server.mjs`. `DockerRuntime` uses `infra/workspace-php85.Dockerfile` (`php:8.5-fpm` + Caddy, `pdo_dblib` + `pdo_odbc`/`msodbcsql18`, no `pdo_sqlsrv`, no `ext-redis`). Preview URLs in development: `/-/p/{token}`.

Side effects are forced off (`MAIL_MAILER=log`, integration flags false). Isolation env sets `SESSION_COOKIE`, `APP_URL`, `QUEUE_NAME`, `REDIS_PREFIX`, and `CACHE_PREFIX` per workspace.

## ACP

`cursor-agent acp` is the first provider. The available Origin-scoped token cannot authenticate (`permission_denied` on `cursor_login`); the handshake is recorded in `fixtures/acp/initialize-handshake.ndjson`. Development uses `MockProvider` until a Cursor user token exists.

## Feature flags

`publish`, `multiProvider`, `spectator`, and `recipes` live in the platform store and can be flipped without a deploy.
