# Per-user token limits and usage profiles — design and implementation plan

Status: implemented. Phases 0–6 below landed together; this file is the reference for the shape of
the feature and for the decisions that are configuration rather than code.

Locked configuration:

- Seeds: starter 5M / standard 20M / premium 60M tokens per month. Editable later in `/admin`.
- `usageLimits` ships **on**, every seed in `block` mode.
- Period reset: day 1 in `America/Sao_Paulo` (`ATELIER_USAGE_TZ`).
- Admins are subject to their own profile. Extra room is an auditable grant, including self-grants.

## 1. Problem

The Cursor credential is global: signed-in CLI accounts live under `var/cursor-home/<id>/` and `var/env/providers.env` holds `CURSOR_API_KEY` (and `_2`…). Every signed-in
user prompts through that host roster (`cursorAuthCandidates` → `CursorProvider.start`). Billing lands on whichever CLI account or key ran the prompt, so a single user can consume the whole
budget and nothing in the studio notices.

We need three assignable **usage profiles** with token limits, an admin screen to edit those
limits, and enforcement per user. Accounting has to be **local**: providers differ, and the
protocol does not give us a uniform per-turn token count (see §3).

## 2. What existed before (and what must stay orthogonal)

| Piece | State before this work | Where |
| --- | --- | --- |
| Per-run budget | duration, tool calls, cost — enforced mid-run | `packages/domain/src/budget.ts`, `platform.ts` `runPrompt` |
| `costUsd` | always `0`; nothing ever incremented it | `platform.ts` |
| Usage log | in-memory array, never read outside the module, lost on restart | `services/supervisor/src/otel.ts` `usageLog` |
| Token estimate | `chars / 4`, applied only to the packed **input** prompt | `packages/domain/src/context.ts` |
| Output tokens | not counted | — |
| Disk quota | per-workspace bytes, surfaced with a progress bar | `packages/domain/src/quota.ts` |
| Roles | `owner` / `editor` / `viewer`, derived from GitHub repo permission | `packages/domain/src/authz.ts` |

`Role` must not be reused as a limit profile. Roles come from GitHub repo permissions and answer
"can this person edit?". Profiles answer "how much can this person spend?". They are orthogonal:
an `editor` may be on the smallest profile, an `owner` on the largest.

Shipped: a per-user ledger, three seeded profiles, pre-flight + mid-run gates, `/admin` Token
limits, and a remaining-tokens surface in the studio settings sheet.

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

| Profile | monthly tokens | providers |
| --- | --- | --- |
| `starter` | 5,000,000 | all allowed |
| `standard` | 20,000,000 | all allowed |
| `premium` | 60,000,000 | all allowed |

Every seed ships with `providers: []`. A non-empty list is a restriction, so seeding one would mean
that enabling a second provider in `/admin` silently blocks prompts on the two smaller profiles.
Restricting a profile to `cursor` is a deliberate admin edit, not a default.

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
summarizeUsage(input): UsageSummary;   // period tokens, grants, remaining, percent
evaluateUsage(input): UsageDecision;   // { decision: "allow" | "warn" | "block", reason }
```

`UsageDecision.reason` is `"monthly" | "provider" | null`.
`0` means unlimited. `evaluateUsage` takes a `pendingEstimate` so the pre-flight check
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

**Mid-run** — if the live billable tokens for this run plus the period total would exceed the
monthly cap, cancel with `budget` reason `"period"`. Runaway protection (duration, tool calls,
USD) stays on the orthogonal `defaultBudget()` in `packages/domain/src/budget.ts` and is not
scaled by the usage plan.

Contracts: the `budget` event `reason` enum keeps `"tokens"` and `"period"` for stored events;
new usage-limit stops emit `"period"`.

Admins are **not** exempt by default; an admin who needs room grants it to themselves and the grant
is on the record.

## 8. API

| Route | Purpose |
| --- | --- |
| `GET /api/admin/usage` | profiles, flags, and per-user current period (tokens, cost, percent, last run) |
| `PUT /api/admin/usage/profiles` | save profiles (Zod-validated, all three at once) |
| `PATCH /api/admin/users/[id]` | accepts `usageProfileId` alongside `platformAdmin` / `disabled` |
| `POST /api/admin/usage/[userId]/grant` | add tokens to the open period with a reason |
| `GET /api/me/usage` | own summary for the composer |

All `/api/admin/*` routes keep `requirePlatformAdmin`. The workspace payload
(`/api/workspace/[id]`) gains `usage: UsageSummary` next to the existing `quota`.

## 9. UI

### 9.1 Admin — new `usage` section

New nav item in the group that holds Providers and Env (`apps/web/app/pages/admin/index.vue`
`navGroups`). One component, `components/admin/UsageProfilesList.vue`, holds both surfaces:

- profile cards — monthly tokens, enforcement (`block` / `warn`), warn threshold, meter. Inline
  validation, one Save.
- people on each plan — login, period tokens vs limit as a bar (same visual language as the disk
  quota bar), last run, grant action.

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
- `usageLimits` — default **on**. Turns the gates on, in the enforcement mode each profile declares.

Both ship on, and all three seeds ship with `enforcement: "block"`, because the global Cursor key is
a shared account: a "measure first, enforce later" rollout leaves that key uncapped for a whole
period, which is the exact failure this feature exists to prevent. The seeds are deliberately
generous so that the first period reads as measurement while still having a ceiling.

Calibration path: read `/admin` → Token limits after a real period, adjust the three profiles
against observed numbers, and move individual users between profiles. A profile can be switched to
`warn` to observe a specific group without blocking it, and turning `usageMetering` off stops
accounting entirely — the failure mode there is "no limits", not "nobody can work".

## 11. Phases

| Phase | Scope | Main files |
| --- | --- | --- |
| 0 | Contracts + pure domain logic + seeds | `packages/contracts/src/index.ts`, `packages/domain/src/usage.ts`, `index.ts` |
| 1 | Store: `DbShape` arrays, seeds, flatten/assemble, Drizzle tables, retention | `store.ts`, `store-shape.ts`, `packages/db/src/schema.ts`, `reconciler.ts` |
| 2 | Metering: ledger write, output estimate, `usage_update` parsing, rollups | `platform.ts`, `acp/events.ts`, `otel.ts` |
| 3 | Enforcement: pre-flight, mid-run cap, 429 mapping | `platform.ts`, `sessions/[id]/command.post.ts` |
| 4 | Admin API + screen | `server/api/admin/usage*`, `admin/index.vue`, `UsageProfilesList.vue` |
| 5 | Studio surface | `useStudio.ts`, `Composer.vue`, `Overlays.vue` |
| 6 | Docs, README, i18n, full suite, PR | `README.md`, this file |

Phases 0–2 are independently shippable: with `usageLimits` off the platform already answers "who
spent what", which is the number needed to calibrate the limits. Phase 3 is what makes the flag
meaningful, and phases 4–5 are what make the numbers visible to an admin and to the person spending
them, so shipping enforcement on means shipping all six.

## 12. Tests

- **domain**: period keys across a month boundary and a DST-free timezone; `0` means unlimited;
  `warn` vs `block`; grants add room; leftover daily/per-run fields are ignored; `meter: "max"`
  picks the larger of estimate and context peak.
- **supervisor**: a mock run writes exactly one ledger entry with input and output tokens;
  cumulative `cost.amount` is not double counted across two runs in one session; pre-flight block
  appends a `budget` event and never calls `provider.start`; mid-run monthly cap cancels the run;
  rollups match a raw scan; retention prune keeps rollups; store flatten/assemble round-trips the
  new arrays (`compareStoreShapes` returns `[]`); profile save rejects negative numbers.
- **web**: i18n parity; the usage bar/percent helper.
- **eval**: unchanged. Metering must not alter gold results.

## 13. Risks

- **Underestimation.** Our count misses the agent's internal context. Mitigated by `meter: "max"`
  plus `usage_update`, and by calibrating the generous seeds against a real period.
- **Cursor does not report usage.** Then `contextPeakTokens` and `costUsd` stay `0` and enforcement
  runs on the estimate alone. The limits are still a useful ceiling, but they are a proxy for spend,
  not the invoice. Calibrate after one real period; switch a profile to `warn` if the estimate is
  too noisy to block on.
- **Ledger growth.** One entry per run is small, but a JSON store rewrites the whole file on every
  update. Rollups plus retention keep it bounded; the Postgres snapshot path already exists if it
  outgrows JSON.
- **Shared sessions.** Attribution is per prompt author, so a spectator turned editor spends their
  own budget. Worth confirming this matches how the team works.
