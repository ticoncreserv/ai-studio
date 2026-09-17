# ACP providers, sandbox, and platform store

Status: implemented behind flags. Live Docker, bubblewrap, Postgres, and vendor CLIs are host-dependent; missing backends fail closed.

## Why

The studio started as Cursor ACP (`agent --trust acp`) plus `var/platform.json`. Extra agents, a required sandbox, and a relational store were leftover work: the JSON-RPC client assumed Cursor auth, `listProviders` hid every non-Cursor id, and `packages/db` was schema-only.

## ACP client

`AcpSession` speaks generic JSON-RPC:

- `initialize` then optional `authenticate` using `selectAuthMethod` (preferred ids, then env-inferred, then the agent's first method)
- `session/new` / `session/load` / `session/prompt` as requests
- `session/cancel` as a notification (no `id`)
- unknown agent methods are rejected with `-32601`

`ProcessAcpProvider` / `startProcessAcp` is the shared spawn path for Cursor, Claude, Gemini, and Grok. `MockProvider` remains tests-only.

| Provider | Command | Secret | Flag |
| --- | --- | --- | --- |
| Cursor | `agent --trust acp` | `CURSOR_API_KEY` | always (default) |
| Claude | `npx -y @agentclientprotocol/claude-agent-acp` | `ANTHROPIC_API_KEY` (`CLAUDE_API_KEY` alias) | `multiProvider` + `claudeProvider` |
| Gemini | `gemini --acp` | `GEMINI_API_KEY` (`GOOGLE_API_KEY` alias) | `multiProvider` + `geminiProvider` |
| Grok | `grok --no-auto-update agent stdio` | `XAI_API_KEY` | `multiProvider` + `grokProvider` |

Workspace pickers also require the admin enable toggle and a healthy credential + CLI. `providerCanary` hides extras unless `ATELIER_PROVIDER_CANARY=1`.

## Sandbox

`resolveSandboxProfile` maps flags/env to `disabled` | `best-effort` | `required`.

- `sanitizeAgentEnv` strips host credentials except the keep-list for the selected provider
- `wrapSandbox` uses bubblewrap when `bwrap` is on PATH, else Docker when `ATELIER_SANDBOX_IMAGE` is set
- `required` throws if neither backend exists
- `best-effort` leaves the command unwrapped

This host may not have `bwrap` or Docker. Tests cover fail-closed required mode without installing those tools.

## Store

`PlatformStore` is `read` / `write` / `update` over `DbShape`.

- `JsonStore` — default (`ATELIER_STORE=json`)
- `SnapshotStore` — flattened rows matching `packages/db` Drizzle tables (`ATELIER_STORE=postgres` or flag `postgresStore`). Live SQL waits on `DATABASE_URL`; until then the snapshot file is the contract.
- `ShadowStore` — JSON primary, snapshot replica (`ATELIER_STORE=shadow` or `postgresShadowRead`)

`flattenDb` / `assembleDb` keep session events and workspace leases in row shape so a later Drizzle adapter can import without rewriting callers.

## Live evals

`pnpm eval` scores transcripts and a disposable git worktree. Live ACP is opt-in: `ATELIER_LIVE_EVAL=1` plus either `ATELIER_LIVE_EVAL_COMMAND` (fake or real binary) or `ATELIER_LIVE_EVAL_PROVIDER`. Missing CLIs skip. The runner always uses a throwaway directory and deletes it.

## Rollout

1. Keys in `/admin` providers (writes `var/env/providers.env`)
2. Flags: provider flag + `multiProvider`
3. Enable the provider row
4. Optional `providerCanary` + `ATELIER_PROVIDER_CANARY=1` on one host
5. Turn `providerCanary` off for everyone
6. `sandboxRequired` only after a backend is installed
7. `postgresShadowRead` then `postgresStore` after `DATABASE_URL` exists
