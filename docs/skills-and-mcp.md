# Skills and MCP — design and implementation plan

Status: proposal. No production code changed yet.

## 1. Scope

Atelier must let a signed-in user use **Agent Skills** and **MCP servers** in a workspace the same
way Cursor does:

- `/` in the composer lists the skills available to the session and invokes one.
- The composer dropdown lists MCP servers and lets the user enable or disable them, and add their
  own custom ones.
- `/admin` manages the **global** layer (skills and MCP servers that apply to every workspace).
- Workspace settings manage the **user** layer (own skills, own custom MCP servers).

### The repository owns the content

Skills and MCP servers are **repository artifacts**, not rows in our application. The clone of
`ticoncreserv/app` already carries skills under `.agents/`, `.cursor/` and `.claude/`, and can carry
`.cursor/mcp.json`. Atelier discovers those files, shows them, lets the user toggle and extend them,
and materializes the extra layers back into the worktree as files. It never becomes the source of
truth for a skill that the repository already defines, and it never rewrites repository files that
it did not create.

Two consequences drive the whole design:

1. **Discovery over registration.** The catalog is produced by walking the worktree, exactly like
   `mentionIndexFromWorktree` and `connectionsFromWorktree` already do for mentions and database
   connections. Platform and user layers are files under `var/`, merged into the worktree the same
   way `mergeWorktreeEnv` merges `.env` layers.
2. **Cursor is already the consumer.** The production provider is `agent acp --trust` with
   `cwd = worktree` (`services/supervisor/src/providers/cursor.ts:79-104`). Cursor itself discovers
   `.cursor/skills`, `.agents/skills`, `.claude/skills` and `.codex/skills` inside that cwd and
   applies `paths` / `disable-model-invocation` on its own. Atelier does not need to inject skill
   bodies into the prompt. Its job is to (a) put the right files in the worktree, (b) show the right
   UI, (c) send `/skill-name …` as prompt text, and (d) hand the right `mcpServers` array to
   `session/new`.

## 2. How Cursor manages these resources

Sources: `cursor.com/docs/skills`, `cursor.com/docs/context/mcp`, `cursor.com/docs/context/rules`,
`agentclientprotocol.com/protocol/slash-commands`, `agentclientprotocol.com/protocol/session-setup`.

### 2.1 Skills

| Aspect | Cursor behavior |
| --- | --- |
| Locations | Project: `.agents/skills/`, `.cursor/skills/`. User: `~/.agents/skills/`, `~/.cursor/skills/`. Compatibility (read-only): `.claude/skills/`, `.codex/skills/` and their `~` variants. |
| Layout | One folder per skill containing `SKILL.md`; optional `scripts/`, `references/`, `assets/`. |
| Nesting | The skills root is walked recursively, so `shipping/land-it/SKILL.md` works and the category folder is decorative — identity comes from the folder holding `SKILL.md`. A nested project root (`apps/web/.cursor/skills/`) is auto-scoped to files under that directory. |
| Frontmatter | `name` (required, `[a-z0-9-]`, 1–64, must equal the folder name), `description` (required, ≤1024, third person, states what and when), `paths` (glob list or comma string; legacy alias `globs`), `disable-model-invocation` (only reachable via `/name`), `icon`, `color`, `metadata`. The open spec also defines `license`, `compatibility`, and the experimental `allowed-tools`. |
| Context cost | Progressive disclosure: only `name` + `description` are always in context. The body is read when the skill is relevant; `references/` and `scripts/` load on demand. |
| Invocation | Model-decided from the description; `/name` to run it for one message; `@name` to attach it as context; Option/Alt+Enter to keep it on for the session as a Custom Mode (badge in the input, styled by `icon`/`color`). |
| Built-ins | `/create-skill`, `/create-rule`, `/review`, `/migrate-to-skills`, … appear in the same `/` list as user skills. |
| Rules vs skills | Rules are short always/glob/description-attached constraints. Skills are on-demand multi-step procedures. `/migrate-to-skills` converts dynamic rules and legacy slash commands (the latter get `disable-model-invocation: true`). |
| Distribution | Customize → Skills lists everything discovered, grouped with rules under "Agent Decides". Personal skills stay local until synced for Cloud Agents; sharing goes through publishing to a team marketplace (a plugin repo with `.cursor-plugin/marketplace.json`). Team admins can force sync off. |

### 2.2 MCP

| Aspect | Cursor behavior |
| --- | --- |
| Config files | `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (global), both `{ "mcpServers": { "<name>": { … } } }`. |
| stdio entry | `type: "stdio"`, `command`, `args`, `env`, `envFile`. |
| Remote entry | `url` + `headers`, optional `auth` (`CLIENT_ID`, `CLIENT_SECRET`, `scopes`) for static OAuth; `envFile` is stdio-only. |
| Interpolation | `${env:NAME}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, `${/}` — resolved in `command`, `args`, `env`, `url`, `headers`, `auth`. |
| Transports | `stdio`, `Streamable HTTP`, `SSE` (deprecated). Supported capabilities: tools, prompts, resources, roots, elicitation, and the MCP Apps UI extension. |
| UI | Customize lists personal, workspace and team servers with a per-server toggle and its tools; a disabled server is not loaded and does not appear in chat. Chat exposes them under "Available Tools", including in Plan mode; each call asks for approval, with arguments expandable, subject to Run Modes. |
| Failure model | A crashed or timed-out server shows an error in chat, marks the call failed, and does not affect other servers. |
| Governance | Enterprise admins keep an allowlist by command pattern and by URL pattern, plus per-tool allowlists and per-server network modes (allow all / allowlist / deny all / no sandbox). Team admins distribute shared servers through a marketplace. Users may be allowed or blocked from adding their own. |

### 2.3 What ACP gives us

- `session/new` and `session/load` take `cwd` **and** `mcpServers`. stdio is mandatory for every
  agent; `http` and `sse` entries are only legal when `initialize` reports
  `agentCapabilities.mcpCapabilities.http` / `.sse`.
- Slash commands are protocol-level: the agent advertises them with the
  `available_commands_update` session notification (`name`, `description`, optional `input.hint`),
  may update the list at any time, and expects the client to send the command as ordinary prompt
  text (`/web agent client protocol`). This is exactly the data the `/` menu needs, straight from
  Cursor, including its built-in skills.

## 3. Current state in Atelier

| Area | Where | State |
| --- | --- | --- |
| MCP config | `services/supervisor/src/runtime/process.ts:125-139` | `writeMcpConfig()` **overwrites** `worktree/.cursor/mcp.json` with a single hardcoded `laravel-boost` entry on every provision. Any MCP server the repository ships is destroyed. |
| Worktree gitignore | `process.ts:113-123` | Adds `.env`, `.cursor/`, `var/uploads/`. So anything we write under `.cursor/` stays out of commits — useful for materialized layers, and the reason repository skills are expected under `.agents/` or `.claude/`. |
| MCP → ACP | `providers/cursor.ts:37-58, 95-103` | `toAcpMcpServers` handles stdio only (`name`, `command`, `args`, `env` as `{name,value}[]`). No `url`/`headers`, no interpolation, no toggles. |
| Capabilities | `acp/session.ts:79-85` | `initialize` result is discarded, so `mcpCapabilities` and `loadSession` are unknown to us. |
| Slash commands | `acp/events.ts:89-91` | `available_commands_update` is explicitly received and dropped. |
| Skills | — | Nothing. `chat.palette` is already labelled "Skills and context" in `apps/web/i18n/locales/en.json:210-211`, but the palette only offers modes, attach, provider readout and recipes. |
| Closest existing feature | `store.ts:118-137`, `Composer.vue:228-250` | Recipes: three seeded prompt templates with `{{model}}` substitution, gated by the `recipes` flag, applied in `platform.ts:607-613`. Functionally a proto-skill with no files, no descriptions and no agent-side discovery. |
| Rules pipeline (the pattern to copy) | `packages/domain/src/rules.ts`, `platform.ts:1340-1350` | `compileRules` returns virtual files; `materializeRules` writes `AGENTS.md`, `.cursor/rules/{level}-{id}.mdc` and `var/rule-provenance.json` into the worktree, and `materializeRulesEverywhere` fans out to every live worktree. |
| Env layering (the other pattern to copy) | `runtime/env-file.ts` | `var/env/global.env` + `var/env/users/{id}.env` merged into the worktree, with redaction (`redactEnv`, `pickSecretEnv`, `restoreRedactedEnv`, `isSecretEnvKey`) and per-key provenance (`envKeyOrigin`). |
| Composer affordances | `useStudio.ts:428-443`, `Composer.vue:178-190` | `@` mention autocomplete already watches the prompt and renders a menu above the input. `/` will be its sibling. |

## 4. Target model

### 4.1 Three layers, one merge

```
repository layer   worktree/.agents/skills, .cursor/skills, .claude/skills, .codex/skills
                   worktree/.cursor/mcp.json (as committed by the repo)
                        ↑ read-only in Atelier; the agent edits it through normal diffs
platform layer     var/skills/global/<name>/SKILL.md          (admin)
                   var/mcp/global.json                        (admin)
                   var/mcp/policy.json                        (admin allowlist)
user layer         var/skills/users/{userId}/<name>/SKILL.md  (workspace owner)
                   var/mcp/users/{userId}.json                (workspace owner)
                        ↓ materialized on provision, on save, and on "apply"
worktree           .cursor/skills/<name>/SKILL.md   (gitignored, pruned from a manifest)
                   .cursor/mcp.json  = repo servers + platform + user, disabled removed
```

Precedence for equal names: **repository > user > platform**. A shadowed layer is not written and is
reported in the UI as "shadowed by the repository", so nobody debugs an edit that has no effect.
Toggles live in the platform store, not in the files, because they are per-user state:

```ts
// services/supervisor/src/store.ts — DbShape additions
skillPrefs: Array<{ userId: string; name: string; enabled: boolean }>;
mcpPrefs: Array<{ userId: string; name: string; enabled: boolean }>;
```

Everything else about a skill or a server stays in a file, so it can be diffed, reviewed and — for
the promote path in §8 — committed to the repository.

### 4.2 Reading the catalog

New pure module `packages/domain/src/skills.ts`:

```ts
export type SkillSource = "repo" | "platform" | "user";

export interface SkillDefinition {
  name: string;               // folder name; also the /command
  description: string;
  source: SkillSource;
  dir: string;                // ".agents/skills/land-it" — relative to the worktree
  paths: string[];            // from `paths`, falling back to legacy `globs`
  manualOnly: boolean;        // disable-model-invocation
  icon?: string;
  color?: string;
  metadata?: Record<string, string>;
  scope?: string;             // nested project root, e.g. "apps/web"
  issues: SkillIssue[];       // name/description/frontmatter violations
}

export function parseSkillFile(text: string): { frontmatter: Record<string, unknown>; body: string };
export function validateSkill(folder: string, frontmatter: Record<string, unknown>): SkillIssue[];
export function skillCatalog(found: SkillDefinition[]): { skills: SkillDefinition[]; shadowed: SkillDefinition[] };
export function renderSkillFile(definition: SkillDefinition, body: string): string;
export function slashQuery(text: string): string | null;      // "/lan" → "lan", "hi /x" → null
export function slashMatches(catalog: SkillDefinition[], query: string): SkillDefinition[];
```

The frontmatter reader is a deliberately small YAML subset (scalars, `key: [a, b]`, `-` lists,
quoted strings, comma strings) so `packages/domain` keeps its no-dependency, no-I/O contract
enforced by `.dependency-cruiser.cjs`.

New pure module `packages/domain/src/mcp.ts`:

```ts
export type McpServerConfig =
  | { name: string; transport: "stdio"; command: string; args: string[]; env: Record<string, string>; envFile?: string }
  | { name: string; transport: "http" | "sse"; url: string; headers: Record<string, string> };

export interface McpEntry { config: McpServerConfig; source: SkillSource; enabled: boolean; issues: string[] }

export function parseMcpConfig(raw: unknown, source: SkillSource): McpEntry[];
export function mergeMcpLayers(layers: { repo: McpEntry[]; platform: McpEntry[]; user: McpEntry[] }, prefs: Record<string, boolean>): McpEntry[];
export function interpolateMcp(entry: McpEntry, vars: { env: Record<string, string>; workspaceFolder: string; userHome: string }): McpEntry;
export function toAcpMcpServers(entries: McpEntry[], caps: { http?: boolean; sse?: boolean }): AcpMcpServer[];
export function mcpPolicyDecision(entry: McpEntry, policy: McpPolicy, actor: { admin: boolean }): "allow" | "deny";
export function redactMcpEntry(entry: McpEntry): McpEntry;   // secret env values / headers → "••••"
```

`toAcpMcpServers` moves out of `providers/cursor.ts` (its stdio mapping and `envToAcpList` behavior
are kept and re-tested), gains `type: "http" | "sse"` entries with `headers: [{name,value}]`, and
drops remote entries when the agent did not advertise the matching capability.

### 4.3 Supervisor

| New / changed | File | Responsibility |
| --- | --- | --- |
| new | `src/skills/catalog.ts` | `scanWorktreeSkills(worktree)`: walk `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills` at the root and in nested project roots, depth-capped, skipping `node_modules`, `vendor`, `var`, `.git`; parse and validate each `SKILL.md`; set `scope` for nested roots. |
| new | `src/skills/layers.ts` | Read/write `var/skills/global` and `var/skills/users/{id}`; `materializeSkills(worktree, entries)` writes enabled platform+user skills into `worktree/.cursor/skills/<name>/SKILL.md` and prunes what it wrote before, using a manifest at `worktree/var/atelier-skills.json` (same idea as `var/rule-provenance.json`). Name is validated against `^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$` before it ever touches a path. |
| new | `src/mcp/layers.ts` | Read/write `var/mcp/global.json`, `var/mcp/users/{id}.json`, `var/mcp/policy.json`; `mergeWorktreeMcp(worktree, …)` writes `.cursor/mcp.json` from repo + platform + user minus disabled, **preserving unknown repo keys**. |
| replace | `src/runtime/process.ts:125-139` | Delete `writeMcpConfig`; `provision` calls `mergeWorktreeMcp`. `laravel-boost` moves to a seeded default in `var/mcp/global.json` (created on first read if the file is absent), so Boost keeps working and a repo-provided config is no longer destroyed. |
| change | `src/acp/session.ts` | Keep the `initialize` result in `capabilities` (expose `loadSession`, `mcpCapabilities`); add an `onCommands(list)` callback fired from the `session/update` branch when `sessionUpdate === "available_commands_update"`. |
| change | `src/acp/events.ts:89-91` | Map `available_commands_update` to a new **ephemeral** event instead of dropping it. |
| change | `src/providers/cursor.ts` | Accept `mcpServers: McpEntry[]`, convert with `toAcpMcpServers(entries, acp.capabilities.mcpCapabilities)`, forward `onCommands`. |
| change | `src/platform.ts` | `skillCatalog(workspaceId)`, `mcpCatalog(workspaceId)`, `setSkillEnabled`, `setMcpEnabled`, `saveGlobalSkill`/`saveUserSkill`/`deleteSkill`, `saveGlobalMcp`/`saveUserMcp`/`deleteMcpServer`, `saveMcpPolicy`, `applySkillsAndMcp(workspaceId)`; materialize in `ensureWorkspace` right after `materializeRules` (`platform.ts:238-239`); invalidate the live ACP run when the resolved MCP set or skill manifest changes, reusing the mode-invalidation shape at `platform.ts:661-667` with a `runFingerprints: Map<sessionId, string>`. |
| change | `src/store.ts` | `skillPrefs` / `mcpPrefs` in `DbShape`, defaults in `emptyDb()`, `read()` merge. |

Why an ephemeral event for available commands: `Platform.append` already publishes
`assistant_delta` on the bus **without** persisting it (`platform.ts:428-431`). Available commands
are session state, not conversation history, so they follow that precedent — the `/` menu updates
live over the existing WebSocket and the session store stays clean.

### 4.4 Contracts

```ts
// packages/contracts/src/index.ts
export const SkillSourceSchema = z.enum(["repo", "platform", "user"]);
export const SkillDescriptorSchema = z.object({ name, description, source, dir, paths, manualOnly, icon?, color?, scope?, enabled, shadowed, issues });
export const McpTransportSchema = z.enum(["stdio", "http", "sse"]);
export const McpDescriptorSchema = z.object({ name, transport, source, enabled, target, secrets, editable, issues });
export const AvailableCommandSchema = z.object({ name: z.string(), description: z.string().default(""), hint: z.string().optional() });

// SessionEventSchema += (ephemeral, published but never stored)
z.object({ type: z.literal("available_skills"), id, at, commands: z.array(AvailableCommandSchema) }),

// ClientCommandSchema prompt variant += skill?: z.string().optional()
// FeatureFlagSchema += "skills", "mcp"
```

`skill` on the prompt command is metadata only: the text keeps its `/name …` prefix because that is
what ACP expects. It is used to render the chip on the user turn and to keep telemetry honest.
`FeatureFlag` additions must be mirrored in `packages/domain/src/flags.ts` (`defaultFlags`),
`store.ts` defaults, and `apps/web/app/pages/admin/index.vue:133` (`flagList`).

### 4.5 Web API

| Route | Guard | Purpose |
| --- | --- | --- |
| `GET /api/workspace/[id]/skills` | `requireWorkspaceAccess(view)` | Full catalog with source, enabled, shadowed, issues. |
| `PATCH /api/workspace/[id]/skills/[name]` | `edit` | Enable/disable for the calling user. |
| `PUT` / `DELETE /api/me/skills/[name]` | `requireUser` | Create, update, delete an own skill (name, description, paths, manualOnly, body). |
| `GET /api/workspace/[id]/mcp` | `view` | Merged servers, redacted, with provenance and status. |
| `PATCH /api/workspace/[id]/mcp/[name]` | `edit` | Enable/disable. |
| `PUT` / `DELETE /api/me/mcp/[name]` | `requireUser` | Own custom server, policy-checked. |
| `POST /api/workspace/[id]/mcp/[name]/probe` | `edit` | stdio: command resolvable on `PATH`; remote: reachability. |
| `GET` / `PUT /api/admin/skills`, `DELETE /api/admin/skills/[name]` | `requirePlatformAdmin` | Global skills. |
| `GET` / `PUT /api/admin/mcp`, `PUT /api/admin/mcp/policy` | `requirePlatformAdmin` | Global servers and allowlist. |
| `POST /api/admin/skills/apply`, `POST /api/admin/mcp/apply` | `requirePlatformAdmin` | Fan out to every live worktree, mirroring `POST /api/admin/env/apply`. |

`apps/web/server/api/workspace/[id].get.ts` gains `skills` and `mcp` blocks so the composer has both
catalogs on first paint, and `apps/web/app/types/studio.ts` grows the matching `StudioPayload`
fields. Authorization is enforced in `Platform`, not only in the route, so the supervisor stays safe
when called from the CLI or a test.

### 4.6 Chat UI

**`/` menu.** A sibling of the existing mention watcher in `useStudio.ts:428-443`:

```ts
const slash = computed(() => slashQuery(prompt.value));      // pure helper from @atelier/domain
watch(prompt, () => { slashOpen.value = slash.value !== null; });
```

- Opens only when the token starts at the beginning of the prompt (Cursor's behavior), stays open
  while the user types the name, and closes on space, Esc or empty match.
- Rows show name, description, and a source badge (`repository`, `global`, `yours`, `agent`).
  Agent rows come from the ephemeral `available_skills` event, so Cursor's own built-ins
  (`/create-skill`, `/review`, …) appear exactly as in Cursor.
- Enter or click inserts `/name ` and pins a chip next to the mode pills; the chip's `×` removes the
  prefix. Arrow keys reuse the palette's `cursor`/`movePalette` pattern (`Composer.vue:132-141`).
- Manual-only skills (`disable-model-invocation: true`) are ranked first, since `/` is their only
  entry point.

**MCP dropdown.** The `+` palette (already titled "Skills and context") gains two submenus built
like the recipes submenu (`Composer.vue:228-250`):

- **Skills** — enable/disable switches per skill, grouped by source, plus "Manage skills" → new
  sheet.
- **Tools** — one row per MCP server: name, transport, source badge, status dot, `UiSwitch`, and
  "Add server" → new sheet. Repo and global servers are toggleable but not editable; a user's own
  servers are editable. Disabled servers are not sent to `session/new` at all, matching Cursor.

Toggling either list writes through the API and, because the resolved fingerprint changed, the next
prompt starts a fresh ACP session with the new `mcpServers` array — the same restart the mode switch
already performs.

**Sheets.** `StudioSheet` becomes `"rules" | "connections" | "settings" | "skills" | "mcp" | null`
(`apps/web/app/types/studio.ts:66`), with two new blocks in `Overlays.vue` following the rules sheet
layout: repository skills read-only with a body preview and their validation issues; own skills with
a small form (name, description, paths, manual-only, body) and delete; MCP servers as cards with
redacted secrets, probe button, and a JSON editor for advanced entries. Command palette gains
`command.skills` and `command.mcp`; `SessionRail` gains the shortcuts next to Rules.

**Event thread.** `EventCard` tags a `tool_call` whose name matches `mcp_<server>_<tool>` with the
server label, and renders a skill chip on a `user_message` that starts with `/name`.

### 4.7 Admin

Two new sections in `apps/web/app/pages/admin/index.vue`, declared in `navGroups`
(`admin/index.vue:115-130`) next to Rules, and rendered inline with the existing
`cx-section` / `cx-panel` / `cx-row` markup:

- **Skills** — list of global skills (name, description, manual-only, `paths`, shadowed-by-repo
  badge), editor rows in the shape of the rules textareas (`admin/index.vue:1097-1116`), delete with
  the existing confirm-dialog pattern, and **Apply to worktrees** mirroring `applyEnv`.
- **MCP** — global `mcpServers` editor (form rows plus a raw JSON mode, exactly like
  `AdminEnvEditor`'s form/raw switch), secret masking through `env-mask.ts`, per-server probe, and
  the **policy** panel: allowed commands, allowed URL patterns, and "users may add their own
  servers".

New flags `skills` and `mcp` appear in the Flags section automatically once added to `flagList`.

### 4.8 i18n

New namespaces `skills.*` and `mcp.*`, plus `chat.slashHint`, `chat.slashEmpty`, `chat.skillChip`,
`chat.tools`, `command.skills`, `command.mcp`, `admin.skillsSection`, `admin.skillsHint`,
`admin.mcpSection`, `admin.mcpHint`, `admin.mcpPolicy*`, `flags.skills`, `flags.mcp`,
`admin.flagHint.skills`, `admin.flagHint.mcp`. English is the key source; `pt-BR.json` must stay at
full parity and every literal `@` must be written `{'@'}` — both are enforced by
`scripts/ci/check-i18n.mjs`.

## 5. Security

| Risk | Mitigation |
| --- | --- |
| An MCP stdio server is an arbitrary command executed next to the app | Users may toggle repository and global servers and add **remote** (`url`) servers. Adding a `command` server is admin-only unless the command matches `var/mcp/policy.json`. Checked at write time and again at merge time, in `Platform`, mirroring `evaluatePermission`'s shape. |
| Secrets in `env` / `headers` / `auth` | Reuse `isSecretEnvKey`, `redactEnv`, `restoreRedactedEnv`: the API never returns a raw secret, saving back `••••` keeps the stored value, and reveal is a per-key endpoint like `revealGlobalEnvKey`. |
| Path traversal through a skill name | Names are validated against the Agent Skills pattern before any path is built; materialization only ever writes under `worktree/.cursor/skills/` and only prunes paths listed in its own manifest. |
| Untrusted skill bodies and `scripts/` | Nothing is executed by the supervisor. Scripts run only when the agent runs them, through the existing permission flow, and remain subject to the platform rule that forbids `migrate:fresh`, `db:wipe` and ERP writes. |
| A repository config being silently replaced | The merge preserves unknown keys, never deletes repository files, and reports shadowing in the UI. |
| Tool sprawl degrading the agent | Show the enabled-server count in the Tools submenu and warn past a threshold, the same failure Cursor's 40-tool guidance addresses. |

## 6. Tests

| Package | File | Coverage |
| --- | --- | --- |
| domain | `src/skills.test.ts` | Frontmatter subset parsing, `paths` as list and as comma string, legacy `globs`, name/folder mismatch, description length, precedence and shadowing, `slashQuery` / `slashMatches`. |
| domain | `src/mcp.test.ts` | stdio and remote parsing, layer merge with disabled entries, interpolation, capability gating, policy decisions, redaction. |
| supervisor | `src/skills/catalog.test.ts` | Temp worktree with `.agents`, `.cursor`, `.claude` and a nested `apps/web/.cursor/skills`; category folders; invalid skills surfaced, not thrown. |
| supervisor | `src/mcp/layers.test.ts` | Repository servers survive a merge; `laravel-boost` still reaches `session/new`; disabled entries are dropped; unknown repo keys are preserved. |
| supervisor | `src/platform.test.ts` | Toggle → materialize → `.cursor/mcp.json` and `.cursor/skills` contents; fingerprint change restarts the run; non-admin cannot write a global skill or a command server. |
| supervisor | `src/providers/cursor.test.ts` | http/sse mapping gated on `initialize` capabilities; `available_commands_update` reaches `onCommands`. |
| web | `app/utils/slash.test.ts` | The composer's pure `/` helpers, in the style of `chat-events.test.ts`. |
| fixtures | `fixtures/laravel-app/.agents/skills/**`, `.claude/skills/**`, `.cursor/mcp.json` | Give the `VITEST` clone real skills and a repo MCP entry so discovery is exercised end to end. |
| eval | `fixtures/acp/skill-invocation.ndjson` | A gold task where the user sends `/create-inertia-page` and the transcript shows the skill applied, wired into `pnpm eval`. |

`pnpm test`, `pnpm i18n:check` and `pnpm eval` already run in CI, so no workflow change is needed.

## 7. Phases

Each phase is a separate commit and independently shippable.

| # | Phase | Changes |
| --- | --- | --- |
| P0 | Stop clobbering `.cursor/mcp.json` | `runtime/process.ts`, new `mcp/layers.ts`, seeded `var/mcp/global.json`, tests. Fixes a live bug on its own and unblocks everything else. |
| P1 | Read path | domain `skills.ts` + `mcp.ts`, supervisor scanners, contracts, `initialize` capabilities, `available_commands_update` capture, workspace payload. No UI. |
| P2 | Chat surface | `/` menu, Tools submenu, toggles, run invalidation, i18n. |
| P3 | User layer | Workspace sheets, own skills CRUD, own MCP servers, user materialization. |
| P4 | Admin layer | Global skills, global MCP, policy, apply-to-worktrees, flags. |
| P5 | Recipes → skills | Convert the three seeded recipes into `disable-model-invocation: true` global skills, keep the `recipes` flag for one release, then remove the palette submenu. |
| P6 | Polish | Probes, MCP tags on tool calls, skill chip on user turns, eval gold task, README section. |

## 8. Decisions to confirm

1. **Where the platform and user layers land in the worktree.** The plan writes them to
   `.cursor/skills/` because `.cursor/` is gitignored there, so an admin edit never shows up as an
   uncommitted diff in the user's branch. The alternative is `.agents/skills/`, which would make
   them committable and reviewable but would pollute `git status` on every workspace. Proposal:
   `.cursor/` now, plus a later **Promote to repository** action that writes `.agents/skills/<name>`
   so a skill can travel to `ticoncreserv/app` through a normal PR.
2. **Whether global skills should live in `ticoncreserv/app` from the start** instead of `var/`.
   Repository-first argues yes, but an admin edit must not land on `main` without review, which
   makes the promote path above the safer default.
3. **`@skill-name` as context attach.** Cursor supports it next to `/`. Deferred to P6 unless it is
   wanted with the first release.
4. **Custom Modes.** Cursor can pin a skill for a whole session (Option+Enter, badge in the input).
   Atelier's mode pills are `Build / Plan / Ask`; a pinned skill would be a fourth, session-scoped
   chip. Out of scope here, cheap to add after P2.
5. **Recipes removal timing** — flag-off in P5, delete in the following release.
