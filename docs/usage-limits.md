# Per-user token limits and usage profiles — design and implementation plan

Status: proposal. No production code changed yet.

## 1. Problem

The Cursor key is global: `var/env/providers.env` holds one `CURSOR_API_KEY` and every signed-in
user prompts through it (`readProviderCredential` → `applyProviderCredential` →
`CursorProvider.start`). Billing lands on one account, so a single user can consume the whole
budget and nothing in the studio notices.

We need three assignable **usage profiles** with token limits, an admin screen to edit those
limits, and enforcement per user. Accounting has to be **local**: providers differ, and the
protocol does not give us a uniform per-turn token count (see §3).

## 2. What exists today

| Piece | State | Where |
| --- | --- | --- |
| Per-run budget | duration, tool calls, cost — enforced mid-run | `packages/domain/src/budget.ts`, `platform.ts` `runPrompt` |
| `costUsd` | always `0`; nothing ever increments it | `platform.ts` `const usage = { …, costUsd: 0 }` |
| Usage log | in-memory array, never read outside the module, lost on restart | `services/supervisor/src/otel.ts` `usageLog` |
| Token estimate | `chars / 4`, applied only to the packed **input** prompt, fixed 4000-token context budget | `packages/domain/src/context.ts`, `platform.ts` `packPrompt(…, 4000)` |
| Output tokens | not counted at all | — |
| Disk quota | per-workspace bytes, surfaced with a progress bar | `packages/domain/src/quota.ts`, `Overlays.vue` |
| Roles | `owner` / `editor` / `viewer`, derived from GitHub repo permission | `packages/domain/src/authz.ts` |

Two consequences:

1. There is no per-user meter to enforce against. `recordUsage` is telemetry, not accounting.
2. `Role` must not be reused as a limit profile. Roles come from GitHub repo permissions and answer
   "can this person edit?". Profiles answer "how much can this person spend?". They are orthogonal:
   an `editor` may be on the smallest profile, an `owner` on the largest.

## 3. What the protocol gives us (and why control stays local)

ACP stabilized `usage_update` on 2026-06-05:

```json
{ "sessionUpdate": "usage_update", "used": 53000, "size": 200000,
  "cost": { "amount": 0.045, "currency": "USD" } }
```

Three facts drive the design:

- `used` / `size` describe the **current context window**, not cumulative consumption. Summing
  `used` across turns double counts.
- `cost.amount` is **cumulative for the session**, so only deltas are meaningful.
- Per-turn token counts (`PromptResponse.usage` with `inputTokens` / `outputTokens`) are still
  **Draft**, and implementations are uneven.

`eventsFromAcpUpdate` currently drops `usage_update` (unknown updates return `[]`).

So: the local ledger is the source of truth, and provider data is a complement. Our estimate
**underestimates** — the agent reads files and runs tools inside its own loop, and we only see what
it streams. `usage_update` is the correction signal when a provider sends it.

## 4. Data model

### 4.1 Profiles (`packages/domain/src/usage.ts`)

```ts
export interface UsageLimits {
  monthlyTokens: number;   // 0 = unlimited
  dailyTokens: number;     // 0 = unlimited
  perRunTokens: number;    // 0 = unlimited
  perRunToolCalls: number; // 0 = fall back to defaultBudget()
  monthlyCostUsd: number;  // 0 = unlimited; only meaningful when a provider reports cost
}

export interface UsageProfile {
  id: string;                    // "starter" | "standard" | "premium" (seeded, stable)
  label: string;                 // admin-editable data, not i18n chrome
  limits: UsageLimits;
  enforcement: "block" | "warn";
  warnAtPercent: number;         // default 80
  meter: "estimated" | "context_peak" | "max";  // default "max"
  providers: string[];           // [] = every provider the platform allows
}
```

`meter` resolves the §3 gap explicitly: `estimated` uses our own count, `context_peak` uses the
highest `used` a provider reported for the run, `max` takes the larger of the two.

Seeds (all editable in `/admin`, numbers are a starting point to calibrate after one month of real
metering):

| Profile | monthly | daily | per run | tool calls | providers |
| --- | --- | --- | --- | --- | --- |
| `starter` | 5,000,000 | 500,000 | 200,000 | 40 | `cursor` |
| `standard` | 20,000,000 | 2,000,000 | 400,000 | 80 | `cursor` |
| `premium` | 60,000,000 | 6,000,000 | 800,000 | 160 | all allowed |

### 4.2 Assignment

`UserRecord.usageProfileId?: string`. Unset resolves to `ATELIER_DEFAULT_USAGE_PROFILE`
(default `standard`), so existing users keep working after the upgrade without a backfill pass.

### 4.3 Ledger, rollups, grants (`DbShape`)

```ts
usageProfiles: UsageProfile[];
usageLedger: Array<{
  id: string; userId: string; workspaceId: string; sessionId: string; runId: string;
  provider: string; at: string; periodKey: string; dayKey: string;
  inputTokens: number; outputTokens: number; estimatedTokens: number;
  contextPeakTokens: number; costUsd: number; toolCalls: number;
  source: "estimated" | "provider" | "mixed";
}>;
usageRollups: Array<{ userId: string; periodKey: string; tokens: number; costUsd: number; runs: number }>;
usageGrants: Array<{ id: string; userId: string; periodKey: string; tokens: number; reason: string; byUserId: string; at: string }>;
```

Grants are additive and auditable — an admin never edits the ledger to give someone more room.

Rollups keep enforcement O(current period): read the rollup for closed periods, scan raw entries
only for the open one. The reconciler prunes raw entries older than
`ATELIER_USAGE_RETENTION_DAYS` (default 120) and keeps rollups forever.

No migration step is needed. `JsonStore.read` already merges the stored file over `emptyDb()`, so
`usageProfiles` goes through `mergeById` exactly like `recipes` and `rules` — seeds appear in an
existing store, admin edits win — and the ledger/rollup/grant arrays default to `[]`.

### 4.4 Period boundary

`periodKey` is `YYYY-MM` and `dayKey` is `YYYY-MM-DD`, both computed in one configured timezone
(`ATELIER_USAGE_TZ`, default `America/Sao_Paulo`) so a reset does not land mid-afternoon for the
team. The key is stored on the entry at write time, so a later timezone change cannot retroactively
move past usage between periods.

## 5. Pure domain functions

```ts
defaultUsageProfiles(): UsageProfile[];
usagePeriodKey(at: Date, tz?: string): string;
usageDayKey(at: Date, tz?: string): string;
resolveUsageProfile(user, profiles, fallbackId): UsageProfile;
summarizeUsage(input): UsageSummary;   // period/day totals, grants, remaining, percent
evaluateUsage(input): UsageDecision;   // { decision: "allow" | "warn" | "block", reason, remaining }
runBudgetFromProfile(profile): RunBudget;  // bridges into the existing budget check
```

`UsageDecision.reason` is `"monthly" | "daily" | "perRun" | "cost" | "provider" | null`.
`0` means unlimited everywhere. `evaluateUsage` takes a `pendingEstimate` so the pre-flight check
can reject a prompt that would cross the cap instead of starting a run it must kill.

## 6. Accounting

One ledger entry per run, written in the `finally` of `runPrompt` — the single funnel every prompt
already passes through, next to today's `recordUsage` call.

- `inputTokens` = `packed.usedTokens` + `estimateTokens` of attachment blocks
- `outputTokens` = `estimateTokens` of streamed `assistant_delta` text plus `tool_call` output text
  accumulated in the run's `onEvent` closure
- `estimatedTokens` = input + output
- `contextPeakTokens` = highest `used` seen in `usage_update` for the run
- `costUsd` = delta of the cumulative `cost.amount` against the last value stored for that session

`eventsFromAcpUpdate` gains a `usage_update` branch. The numbers reach the run through the same
`onEvent` channel as a new `usage` session event (`contextUsed`, `contextSize`, `costUsd`), which
also lets the composer show context pressure.

Attribution: charge `input.user` from `handleCommand`, not `workspace.userId`. A guest prompting in
someone else's workspace spends their own budget.

## 7. Enforcement

Two gates, both driven by the same profile:

**Pre-flight** — in `handleCommand` before `enqueueWorkspace`, so a blocked prompt never spawns a
provider process. On `block`: append a `budget` event with the new reason, append `run` with status
`rejected`, and throw a typed `UsageLimitError` that the Nitro route maps to **429** with
`data.usage` so the composer can render the real numbers. On `warn`: proceed and append the event.

**Mid-run** — the existing `budgetExceeded` call in the run's `onEvent` closure gains the per-run
token cap using the live output estimate, and cancels with the new reason.

Contracts change: the `budget` event `reason` enum grows from `["duration","toolCalls","cost"]` to
include `"tokens"` (per-run cap) and `"period"` (monthly/daily cap).

Admins are **not** exempt by default; an admin who needs room grants it to themselves and the grant
is on the record.

## 8. API

| Route | Purpose |
| --- | --- |
| `GET /api/admin/usage/profiles` | profiles + assigned user counts |
| `PUT /api/admin/usage/profiles` | save profiles (Zod-validated, all three at once) |
| `GET /api/admin/usage` | per-user current period: tokens, cost, percent, last run, profile |
| `PATCH /api/admin/users/[id]` | accepts `usageProfileId` alongside `platformAdmin` / `disabled` |
| `POST /api/admin/usage/[userId]/grant` | add tokens to the open period with a reason |
| `GET /api/me/usage` | own summary for the composer |

All `/api/admin/*` routes keep `requirePlatformAdmin`. The workspace payload
(`/api/workspace/[id]`) gains `usage: UsageSummary` next to the existing `quota`.

## 9. UI

### 9.1 Admin — new `usage` section

New nav item in the group that holds Providers and Env (`apps/web/app/pages/admin/index.vue`
`navGroups`), with two components:

- `components/admin/UsageProfilesList.vue` — one card per profile: label, monthly / daily / per-run
  tokens, tool calls, cost cap, enforcement (`block` / `warn`), warn threshold, meter, allowed
  providers. Inline validation, one Save.
- `components/admin/UsageTable.vue` — login, profile `<select>`, period tokens vs limit as a bar
  (same visual language as the disk quota bar), cost, last run, grant action.

The existing Users section also gets the profile `<select>` on each row, because that is where
admins already manage people.

### 9.2 Studio

Remaining tokens in the settings sheet next to disk quota, and a composer pill at `warnAtPercent`.
When the decision is `block`, the send button is disabled with the reason instead of failing on
submit.

### 9.3 i18n

New keys in `en.json` and `pt-BR.json` (English is the source): `admin.usage*`,
`admin.usageProfile.*`, `admin.usageMeter.*`, `usage.remaining`, `usage.blocked*`, `usage.warn`,
`flags.usageMetering`, `flags.usageLimits`, plus the two `admin.flagHint.*` entries.
`pnpm i18n:check` enforces parity.

## 10. Flags and rollout

Two new flags in `FeatureFlagSchema` / `defaultFlags` / the admin `flagList`:

- `usageMetering` — default **on**. Writes the ledger, enforces nothing.
- `usageLimits` — default **off**. Turns the gates on.

Rollout: ship with metering only → read `/admin` usage for one period → calibrate the three
profiles against real numbers → assign users → flip `usageLimits`. Turning metering off stops
accounting but never blocks anyone, so the failure mode is "no limits", not "nobody can work".

## 11. Phases

| Phase | Scope | Main files |
| --- | --- | --- |
| 0 | Contracts + pure domain logic + seeds | `packages/contracts/src/index.ts`, `packages/domain/src/usage.ts`, `index.ts` |
| 1 | Store: `DbShape` arrays, seeds, flatten/assemble, Drizzle tables, retention | `store.ts`, `store-shape.ts`, `packages/db/src/schema.ts`, `reconciler.ts` |
| 2 | Metering: ledger write, output estimate, `usage_update` parsing, rollups | `platform.ts`, `acp/events.ts`, `otel.ts` |
| 3 | Enforcement: pre-flight, mid-run cap, 429 mapping | `platform.ts`, `sessions/[id]/command.post.ts` |
| 4 | Admin API + screen | `server/api/admin/usage*`, `admin/index.vue`, two components |
| 5 | Studio surface | `useStudio.ts`, `Composer.vue`, `Overlays.vue` |
| 6 | Docs, README, i18n, full suite, PR | `README.md`, this file |

Phases 0–3 are independently shippable behind `usageLimits` off: after phase 2 the platform already
answers "who spent what", which is the number needed to calibrate the limits.

## 12. Tests

- **domain**: period/day keys across a month boundary and a DST-free timezone; `0` means unlimited;
  `warn` vs `block`; grants add room; `perRun` vs `monthly` precedence; `runBudgetFromProfile`
  falls back to `defaultBudget()`; `meter: "max"` picks the larger of estimate and context peak.
- **supervisor**: a mock run writes exactly one ledger entry with input and output tokens;
  cumulative `cost.amount` is not double counted across two runs in one session; pre-flight block
  appends a `budget` event and never calls `provider.start`; mid-run per-run cap cancels the run;
  rollups match a raw scan; retention prune keeps rollups; store flatten/assemble round-trips the
  new arrays (`compareStoreShapes` returns `[]`); profile save rejects negative numbers.
- **web**: i18n parity; the usage bar/percent helper.
- **eval**: unchanged. Metering must not alter gold results.

## 13. Risks

- **Underestimation.** Our count misses the agent's internal context. Mitigated by `meter: "max"`
  plus `usage_update`, and by calibrating seeds against a real period before enforcing.
- **Cursor does not report usage.** Then `contextPeakTokens` and `costUsd` stay `0` and enforcement
  runs on the estimate alone. The limits are still a useful ceiling, but they are a proxy for spend,
  not the invoice. This is why the plan is "measure first, enforce second".
- **Ledger growth.** One entry per run is small, but a JSON store rewrites the whole file on every
  update. Rollups plus retention keep it bounded; the Postgres snapshot path already exists if it
  outgrows JSON.
- **Shared sessions.** Attribution is per prompt author, so a spectator turned editor spends their
  own budget. Worth confirming this matches how the team works.
