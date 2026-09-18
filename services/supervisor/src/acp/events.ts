import type { SessionEvent } from "@atelier/contracts";

interface AcpUpdate {
  sessionUpdate?: string;
  content?: unknown;
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  locations?: Array<{ path?: string; line?: number }>;
  rawInput?: unknown;
  rawOutput?: unknown;
  plan?: string;
  overview?: string;
  entries?: Array<{ content?: string; status?: string }>;
  availableCommands?: Array<{ name?: string; description?: string; input?: { hint?: string } }>;
  used?: number;
  size?: number;
  cost?: { amount?: number; currency?: string };
}

const TARGET_INPUT_KEYS = ["path", "file_path", "filePath", "target_file", "command", "query", "pattern", "glob"] as const;

function isPlaceholderToolName(name: string): boolean {
  return !name.trim() || name.trim() === "tool";
}

function toolNameFromUpdate(update: AcpUpdate): string {
  const title = typeof update.title === "string" ? update.title.trim() : "";
  if (!isPlaceholderToolName(title)) return title;
  const kind = typeof update.kind === "string" ? update.kind.trim() : "";
  if (!isPlaceholderToolName(kind)) return kind;
  return title || kind || "tool";
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toolTargetFromUpdate(update: AcpUpdate): string | undefined {
  const path = stringField(update.locations?.[0]?.path);
  if (path) return path;
  const input = update.rawInput;
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  for (const key of TARGET_INPUT_KEYS) {
    const value = stringField(record[key]);
    if (value) return value;
  }
  return undefined;
}

function nestedText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return stringField((value as { text?: unknown }).text);
}

function toolOutputFromUpdate(update: AcpUpdate): string | undefined {
  if (typeof update.rawOutput === "string" && update.rawOutput) return update.rawOutput;
  const content = update.content;
  if (!content) return undefined;
  const items = Array.isArray(content) ? content : [content];
  const parts: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const nested = nestedText(row.content) ?? nestedText(row);
    if (nested) parts.push(nested);
  }
  const text = parts.join("\n").trim();
  return text || undefined;
}

function messageChunkText(content: unknown): string | undefined {
  return nestedText(content);
}

export function eventsFromAcpUpdate(msg: Record<string, unknown>): SessionEvent[] {
  const update = (msg.params as { update?: AcpUpdate } | undefined)?.update;
  if (!update?.sessionUpdate) return [];
  const at = new Date().toISOString();
  const id = crypto.randomUUID();

  if (
    update.sessionUpdate === "agent_thought_chunk" ||
    update.sessionUpdate === "agent_thought" ||
    update.sessionUpdate === "thought_chunk"
  ) {
    return [];
  }
  const chunkText = messageChunkText(update.content);
  if (update.sessionUpdate === "agent_message_chunk" && chunkText) {
    return [{ type: "assistant_delta", id, at, text: chunkText }];
  }
  if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
    const status = update.status === "completed" || update.status === "failed" ? update.status : "running";
    const kind = stringField(update.kind);
    const target = toolTargetFromUpdate(update);
    const output = toolOutputFromUpdate(update);
    const input = update.rawInput;
    return [
      {
        type: "tool_call",
        id,
        at,
        toolCallId: update.toolCallId ?? id,
        name: toolNameFromUpdate(update),
        status,
        ...(kind ? { kind } : {}),
        ...(target ? { target } : {}),
        ...(output ? { output } : {}),
        ...(input !== undefined ? { input } : {}),
      },
    ];
  }
  if (update.sessionUpdate === "todo" || update.sessionUpdate === "todos") {
    return [
      {
        type: "todos",
        id,
        at,
        merge: update.sessionUpdate === "todo",
        todos: (update.entries ?? []).map((entry, index) => ({
          id: String(index),
          content: entry.content ?? "",
          status: entry.status === "completed" ? "completed" : entry.status === "in_progress" ? "in_progress" : "pending",
        })),
      },
    ];
  }
  if (update.sessionUpdate === "ask_user_question" || update.sessionUpdate === "question") {
    return [
      {
        type: "question",
        id,
        at,
        title: update.title ?? "The agent needs a choice",
        questions: (update.entries ?? []).map((entry, index) => ({
          id: String(index),
          prompt: entry.content ?? "",
          options: [],
          allowMultiple: false,
        })),
        outcome: "pending",
      },
    ];
  }
  if (update.sessionUpdate === "plan" && (update.plan || update.overview)) {
    return [
      {
        type: "plan",
        id,
        at,
        name: update.title,
        overview: update.overview,
        plan: update.plan ?? update.overview ?? "",
        todos: (update.entries ?? []).map((entry, index) => ({
          id: String(index),
          content: entry.content ?? "",
          status: entry.status === "completed" ? "completed" : entry.status === "in_progress" ? "in_progress" : "pending",
        })),
        outcome: "pending",
      },
    ];
  }
  if (update.sessionUpdate === "available_commands_update") {
    return [
      {
        type: "available_skills",
        id,
        at,
        commands: (update.availableCommands ?? []).map((command) => ({
          name: command.name ?? "",
          description: command.description ?? "",
          hint: command.input?.hint,
        })).filter((command) => command.name),
      },
    ];
  }
  if (update.sessionUpdate === "usage_update") {
    // `used`/`size` describe the current context window and `cost.amount` is
    // cumulative for the session — neither is a per-run total on its own.
    return [
      {
        type: "usage",
        id,
        at,
        v: 1,
        contextUsed: Number(update.used ?? 0),
        contextSize: Number(update.size ?? 0),
        costUsd: Number(update.cost?.amount ?? 0),
      },
    ];
  }
  if (update.sessionUpdate === "session_info_update") {
    return [];
  }
  return [];
}

export function permissionFromAcp(params: unknown, rpcId: number): SessionEvent {
  const p = (params ?? {}) as { toolCall?: { title?: string; toolCallId?: string }; options?: Array<{ optionId?: string }> };
  return {
    type: "permission",
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    toolCallId: String(p.toolCall?.toolCallId ?? rpcId),
    title: p.toolCall?.title ?? "Permission requested",
    options: (p.options ?? []).map((option) => option.optionId ?? "").filter(Boolean).length
      ? (p.options ?? []).map((option) => option.optionId!).filter(Boolean)
      : ["allow-once", "allow-always", "reject-once"],
    outcome: "pending",
  };
}
