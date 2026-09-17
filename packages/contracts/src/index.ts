import { z } from "zod";

export const RoleSchema = z.enum(["owner", "editor", "viewer"]);
export type Role = z.infer<typeof RoleSchema>;

export const WorkspaceStatusSchema = z.enum([
  "provisioning",
  "ready",
  "running",
  "hibernated",
  "error",
  "destroyed",
]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const ProviderIdSchema = z.enum(["cursor", "codex", "claude", "gemini", "grok", "mock"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const AgentModeSchema = z.enum(["agent", "plan", "ask"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const InspectPinSchema = z.object({
  label: z.string().min(1),
  note: z.string().min(1),
});
export type InspectPin = z.infer<typeof InspectPinSchema>;

export const TodoStatusSchema = z.enum(["pending", "in_progress", "completed", "cancelled"]);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const ViewportSchema = z.enum(["mobile", "tablet", "desktop"]);
export type Viewport = z.infer<typeof ViewportSchema>;

export const FeatureFlagSchema = z.enum([
  "publish",
  "multiProvider",
  "spectator",
  "recipes",
  "skills",
  "mcp",
  "secureWebSocket",
  "safeUploads",
  "sandboxedAgent",
  "transactionalReview",
  "validationGate",
  "autoPush",
  "workspaceQueue",
  "realProviderEvals",
  "sandboxRequired",
  "postgresStore",
  "postgresShadowRead",
  "claudeProvider",
  "geminiProvider",
  "grokProvider",
  "codexProvider",
  "providerCanary",
  "usageMetering",
  "usageLimits",
]);
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

export const SandboxProfileSchema = z.enum(["disabled", "best-effort", "required"]);
export type SandboxProfile = z.infer<typeof SandboxProfileSchema>;

export const ProviderHealthStatusSchema = z.enum([
  "unconfigured",
  "unavailable",
  "available",
  "degraded",
  "disabled",
]);
export type ProviderHealthStatus = z.infer<typeof ProviderHealthStatusSchema>;

export const ProviderHealthSchema = z.object({
  id: ProviderIdSchema,
  status: ProviderHealthStatusSchema,
  binary: z.boolean(),
  hasCredential: z.boolean(),
  sandbox: SandboxProfileSchema,
  version: z.string().optional(),
  authMethod: z.string().optional(),
  message: z.string().optional(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

/** Why a key stopped answering. Drives the cooldown, never shown to the end user. */
export const ProviderKeyFailureSchema = z.enum(["auth", "quota", "rate_limit"]);
export type ProviderKeyFailure = z.infer<typeof ProviderKeyFailureSchema>;

/**
 * One API key slot of a provider. `ref` is the env key name the secret lives
 * under (`CURSOR_API_KEY`, `CURSOR_API_KEY_2`, ...); the value never leaves the host.
 */
export const ProviderKeyStateSchema = z.object({
  ref: z.string().min(1),
  label: z.string().default(""),
  enabled: z.boolean().default(true),
  failures: z.number().int().min(0).default(0),
  lastUsedAt: z.string().nullable().default(null),
  lastFailureAt: z.string().nullable().default(null),
  cooldownUntil: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  lastFailureKind: ProviderKeyFailureSchema.nullable().default(null),
});
export type ProviderKeyState = z.infer<typeof ProviderKeyStateSchema>;

/**
 * One Cursor CLI login on the host. Session files live under
 * `var/cursor-home/<id>/`; `loggedIn` / `account` come from `agent status`.
 */
export const CursorCliAccountSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(""),
  enabled: z.boolean().default(true),
  loggedIn: z.boolean().default(false),
  account: z.string().nullable().default(null),
  failures: z.number().int().min(0).default(0),
  lastUsedAt: z.string().nullable().default(null),
  lastFailureAt: z.string().nullable().default(null),
  cooldownUntil: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  lastFailureKind: ProviderKeyFailureSchema.nullable().default(null),
});
export type CursorCliAccount = z.infer<typeof CursorCliAccountSchema>;

export const ProviderModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(""),
  description: z.string().optional(),
});
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const UsageMeterSchema = z.enum(["estimated", "context_peak", "max"]);
export type UsageMeter = z.infer<typeof UsageMeterSchema>;

export const UsageEnforcementSchema = z.enum(["block", "warn"]);
export type UsageEnforcement = z.infer<typeof UsageEnforcementSchema>;

/** `0` means unlimited on every numeric limit. */
export const UsageLimitsSchema = z.object({
  monthlyTokens: z.number().int().min(0),
  dailyTokens: z.number().int().min(0),
  perRunTokens: z.number().int().min(0),
  perRunToolCalls: z.number().int().min(0),
  monthlyCostUsd: z.number().min(0),
});
export type UsageLimits = z.infer<typeof UsageLimitsSchema>;

export const UsageProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  limits: UsageLimitsSchema,
  enforcement: UsageEnforcementSchema.default("block"),
  warnAtPercent: z.number().int().min(1).max(100).default(80),
  meter: UsageMeterSchema.default("max"),
  /** Empty means every provider the platform already allows. */
  providers: z.array(z.string()).default([]),
});
export type UsageProfile = z.infer<typeof UsageProfileSchema>;

export const UsageLimitReasonSchema = z.enum(["monthly", "daily", "perRun", "cost", "provider"]);
export type UsageLimitReason = z.infer<typeof UsageLimitReasonSchema>;

export const UsageDecisionSchema = z.object({
  decision: z.enum(["allow", "warn", "block"]),
  reason: UsageLimitReasonSchema.nullable().default(null),
});
export type UsageDecision = z.infer<typeof UsageDecisionSchema>;

export const UsageSummarySchema = z.object({
  userId: z.string(),
  profileId: z.string(),
  profileLabel: z.string(),
  enforcement: UsageEnforcementSchema,
  meter: UsageMeterSchema,
  warnAtPercent: z.number(),
  periodKey: z.string(),
  dayKey: z.string(),
  periodTokens: z.number(),
  dayTokens: z.number(),
  periodCostUsd: z.number(),
  grantedTokens: z.number(),
  runs: z.number(),
  limits: UsageLimitsSchema,
  /** Monthly allowance including grants; `0` with `unlimited` set means no cap. */
  limitTokens: z.number(),
  remainingTokens: z.number(),
  percentUsed: z.number(),
  unlimited: z.boolean(),
  providers: z.array(z.string()),
  decision: UsageDecisionSchema,
  lastRunAt: z.string().nullable().default(null),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "reviewing",
  "validating",
  "accepted",
  "pushed",
  "rejected",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const ValidationStatusSchema = z.enum([
  "not_run",
  "running",
  "passed",
  "failed",
  "timed_out",
  "cancelled",
  "skipped",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

export const EVENT_SCHEMA_VERSION = 1;

export const HunkSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  oldStart: z.number(),
  newStart: z.number(),
  oldLines: z.string(),
  newLines: z.string(),
  status: z.enum(["pending", "accepted", "rejected"]),
});
export type Hunk = z.infer<typeof HunkSchema>;

export const TodoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: TodoStatusSchema,
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const SessionEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user_message"),
    id: z.string(),
    at: z.string(),
    text: z.string(),
    attachments: z.array(z.string()).default([]),
    mentions: z.array(z.string()).default([]),
    inspect: z.array(InspectPinSchema).optional(),
    skill: z.string().optional(),
  }),
  z.object({
    type: z.literal("assistant_message"),
    id: z.string(),
    at: z.string(),
    text: z.string(),
    streaming: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("assistant_delta"),
    id: z.string(),
    at: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool_call"),
    id: z.string(),
    at: z.string(),
    toolCallId: z.string(),
    name: z.string(),
    input: z.unknown().optional(),
    status: z.enum(["running", "completed", "failed"]),
    output: z.string().optional(),
  }),
  z.object({
    type: z.literal("diff"),
    id: z.string(),
    at: z.string(),
    filePath: z.string(),
    hunks: z.array(HunkSchema),
  }),
  z.object({
    type: z.literal("todos"),
    id: z.string(),
    at: z.string(),
    todos: z.array(TodoItemSchema),
    merge: z.boolean().default(true),
  }),
  z.object({
    type: z.literal("plan"),
    id: z.string(),
    at: z.string(),
    name: z.string().optional(),
    overview: z.string().optional(),
    plan: z.string(),
    todos: z.array(TodoItemSchema).default([]),
    outcome: z.enum(["pending", "accepted", "rejected", "cancelled"]).default("pending"),
  }),
  z.object({
    type: z.literal("question"),
    id: z.string(),
    at: z.string(),
    title: z.string().optional(),
    questions: z.array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        options: z.array(z.object({ id: z.string(), label: z.string() })),
        allowMultiple: z.boolean().optional(),
      }),
    ),
    outcome: z.enum(["pending", "answered", "skipped", "cancelled"]).default("pending"),
  }),
  z.object({
    type: z.literal("permission"),
    id: z.string(),
    at: z.string(),
    toolCallId: z.string(),
    title: z.string(),
    options: z.array(z.string()),
    outcome: z.enum(["pending", "allow-once", "allow-always", "reject-once"]).default("pending"),
  }),
  z.object({
    type: z.literal("runtime_error"),
    id: z.string(),
    at: z.string(),
    source: z.enum(["laravel", "vite", "console", "network", "preview"]),
    message: z.string(),
    stack: z.string().optional(),
  }),
  z.object({
    type: z.literal("checkpoint"),
    id: z.string(),
    at: z.string(),
    gitSha: z.string(),
    label: z.string(),
  }),
  z.object({
    type: z.literal("migration"),
    id: z.string(),
    at: z.string(),
    author: z.string(),
    branch: z.string(),
    name: z.string(),
    output: z.string().optional(),
  }),
  z.object({
    type: z.literal("budget"),
    id: z.string(),
    at: z.string(),
    reason: z.enum(["duration", "toolCalls", "cost", "tokens", "period"]),
    message: z.string(),
  }),
  z.object({
    type: z.literal("usage"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    contextUsed: z.number(),
    contextSize: z.number(),
    costUsd: z.number().default(0),
  }),
  z.object({
    type: z.literal("conflict"),
    id: z.string(),
    at: z.string(),
    files: z.array(z.string()),
    message: z.string(),
  }),
  z.object({
    type: z.literal("dropped_context"),
    id: z.string(),
    at: z.string(),
    omitted: z.array(z.string()),
  }),
  z.object({
    type: z.literal("run"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    runId: z.string(),
    status: AgentRunStatusSchema,
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("proposal"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    runId: z.string(),
    baseSha: z.string(),
    proposalSha: z.string(),
    files: z.array(z.string()),
  }),
  z.object({
    type: z.literal("validation"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    runId: z.string(),
    status: ValidationStatusSchema,
    command: z.string(),
    output: z.string().optional(),
    durationMs: z.number().optional(),
  }),
  z.object({
    type: z.literal("run_failure"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    kind: z.enum([
      "diff_capture_failed",
      "proposal_commit_failed",
      "validation_failed",
      "push_failed",
      "permission_denied",
      "provider_failed",
      "provider_failover",
    ]),
    message: z.string(),
  }),
  z.object({
    type: z.literal("prompt_manifest"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    usedTokens: z.number(),
    omitted: z.array(z.string()),
    blocks: z.array(z.object({ id: z.string(), kind: z.string(), tokens: z.number() })),
  }),
  z.object({
    type: z.literal("push"),
    id: z.string(),
    at: z.string(),
    v: z.number().default(1),
    remote: z.string(),
    sha: z.string().optional(),
    status: z.enum(["pushed", "conflict", "skipped", "failed"]),
    message: z.string(),
  }),
  z.object({
    type: z.literal("available_skills"),
    id: z.string(),
    at: z.string(),
    commands: z.array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        hint: z.string().optional(),
      }),
    ),
  }),
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const ClientCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("prompt"),
    text: z.string(),
    attachments: z.array(z.string()).default([]),
    mentions: z.array(z.string()).default([]),
    inspect: z.array(InspectPinSchema).optional(),
    recipeId: z.string().optional(),
    skill: z.string().optional(),
    mode: AgentModeSchema.optional(),
  }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("accept_hunk"), hunkId: z.string() }),
  z.object({ type: z.literal("reject_hunk"), hunkId: z.string() }),
  z.object({ type: z.literal("accept_file"), filePath: z.string() }),
  z.object({ type: z.literal("reject_file"), filePath: z.string() }),
  z.object({ type: z.literal("restore_checkpoint"), checkpointId: z.string() }),
  z.object({ type: z.literal("answer_question"), answers: z.array(z.object({ questionId: z.string(), selectedOptionIds: z.array(z.string()) })) }),
  z.object({ type: z.literal("decide_plan"), outcome: z.enum(["accepted", "rejected"]) }),
  z.object({ type: z.literal("decide_permission"), outcome: z.enum(["allow-once", "allow-always", "reject-once"]) }),
  z.object({ type: z.literal("sync_base") }),
  z.object({ type: z.literal("fix_error"), eventId: z.string() }),
  z.object({ type: z.literal("discard_proposal") }),
  z.object({ type: z.literal("push_studio") }),
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export const ProviderCapabilitySchema = z.object({
  id: ProviderIdSchema,
  label: z.string(),
  command: z.string(),
  args: z.array(z.string()),
  modes: z.array(AgentModeSchema),
  images: z.boolean(),
  todos: z.boolean(),
  plans: z.boolean(),
  questions: z.boolean(),
  /** Default model an admin pinned for this provider. Empty means the agent's own default. */
  model: z.string().optional(),
});
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const EnvKeyKindSchema = z.enum(["structural", "credential", "sideEffect", "isolation"]);
export type EnvKeyKind = z.infer<typeof EnvKeyKindSchema>;

export const WorkspaceSpecSchema = z.object({
  phpVersion: z.string().default("8.5"),
  documentRoot: z.string().default("public"),
  healthCheck: z.object({
    path: z.string().default("/up"),
    timeoutMs: z.number().default(15_000),
  }),
  processes: z.array(
    z.object({
      name: z.string(),
      command: z.string(),
      args: z.array(z.string()).default([]),
      optional: z.boolean().default(false),
      hmrOnly: z.boolean().default(false),
    }),
  ),
  envContract: z.array(
    z.object({
      key: z.string(),
      kind: EnvKeyKindSchema,
      required: z.boolean().default(false),
    }),
  ),
  sqlServerDrivers: z.array(z.enum(["dblib", "odbc"])).default(["dblib", "odbc"]),
  forbiddenExtensions: z.array(z.string()).default(["pdo_sqlsrv", "redis"]),
});
export type WorkspaceSpec = z.infer<typeof WorkspaceSpecSchema>;

export const SkillSourceSchema = z.enum(["repo", "platform", "user"]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export const SkillDescriptorSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: SkillSourceSchema,
  dir: z.string(),
  paths: z.array(z.string()).default([]),
  manualOnly: z.boolean().default(false),
  icon: z.string().optional(),
  color: z.string().optional(),
  scope: z.string().optional(),
  enabled: z.boolean().default(true),
  shadowed: z.boolean().default(false),
  issues: z.array(z.string()).default([]),
  editable: z.boolean().default(false),
});
export type SkillDescriptor = z.infer<typeof SkillDescriptorSchema>;

export const McpTransportSchema = z.enum(["stdio", "http", "sse"]);
export type McpTransport = z.infer<typeof McpTransportSchema>;

export const McpDescriptorSchema = z.object({
  name: z.string(),
  transport: McpTransportSchema,
  source: SkillSourceSchema,
  enabled: z.boolean(),
  target: z.string(),
  secrets: z.boolean().default(false),
  editable: z.boolean().default(false),
  issues: z.array(z.string()).default([]),
});
export type McpDescriptor = z.infer<typeof McpDescriptorSchema>;

export const AvailableCommandSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  hint: z.string().optional(),
});
export type AvailableCommand = z.infer<typeof AvailableCommandSchema>;

export const PermissionDecisionSchema = z.enum([
  "allow-once",
  "allow-always",
  "reject-once",
  "auto-allow",
  "auto-deny",
]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;
