import type { SessionEvent } from "@atelier/contracts";

interface AcpUpdate {
  sessionUpdate?: string;
  content?: { text?: string; type?: string };
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  rawOutput?: unknown;
  plan?: string;
  overview?: string;
  entries?: Array<{ content?: string; status?: string }>;
  availableCommands?: Array<{ name?: string; description?: string; input?: { hint?: string } }>;
}

export function eventsFromAcpUpdate(msg: Record<string, unknown>): SessionEvent[] {
  const update = (msg.params as { update?: AcpUpdate } | undefined)?.update;
  if (!update?.sessionUpdate) return [];
  const at = new Date().toISOString();
  const id = crypto.randomUUID();

  if (update.sessionUpdate === "agent_message_chunk" && update.content?.text) {
    return [{ type: "assistant_delta", id, at, text: update.content.text }];
  }
  if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
    const status = update.status === "completed" || update.status === "failed" ? update.status : "running";
    return [
      {
        type: "tool_call",
        id,
        at,
        toolCallId: update.toolCallId ?? id,
        name: update.title ?? update.kind ?? "tool",
        status,
        output: typeof update.rawOutput === "string" ? update.rawOutput : undefined,
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
