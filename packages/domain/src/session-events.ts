import type { SessionEvent } from "@atelier/contracts";

type ToolCallEvent = Extract<SessionEvent, { type: "tool_call" }>;

export function sessionEventKey(event: SessionEvent): string {
  if (event.type === "tool_call") return `tool_call:${event.toolCallId}`;
  return `${event.type}:${event.id}`;
}

function isPlaceholderToolName(name: string | undefined): boolean {
  const cleaned = name?.trim() ?? "";
  return !cleaned || cleaned === "tool";
}

function mergeToolCall(current: ToolCallEvent, incoming: ToolCallEvent): ToolCallEvent {
  const status =
    current.status !== "running" && incoming.status === "running" ? current.status : incoming.status;
  const name =
    isPlaceholderToolName(incoming.name) && !isPlaceholderToolName(current.name)
      ? current.name
      : incoming.name || current.name;
  const kind = incoming.kind || current.kind;
  const target = incoming.target || current.target;
  const output = incoming.output ?? current.output;
  const input = incoming.input !== undefined ? incoming.input : current.input;
  return {
    type: "tool_call",
    id: current.id,
    at: current.at,
    toolCallId: current.toolCallId,
    name,
    status,
    ...(kind ? { kind } : {}),
    ...(target ? { target } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(input !== undefined ? { input } : {}),
  };
}

function preferSessionEvent(current: SessionEvent, incoming: SessionEvent): SessionEvent {
  if (current.type === "tool_call" && incoming.type === "tool_call") {
    return mergeToolCall(current, incoming);
  }
  if ("outcome" in current && "outcome" in incoming) {
    if (current.outcome !== "pending" && incoming.outcome === "pending") return current;
    if (incoming.outcome !== "pending") return incoming;
  }
  return incoming;
}

export function upsertSessionEvent(events: SessionEvent[], event: SessionEvent): SessionEvent[] {
  if (event.type === "assistant_delta" || event.type === "available_skills") return events;
  const key = sessionEventKey(event);
  const index = events.findIndex((row) => sessionEventKey(row) === key);
  if (index >= 0) {
    const next = events.slice();
    next[index] = preferSessionEvent(events[index]!, event);
    return next;
  }
  return [...events, event];
}

export function collapseSessionEvents(events: SessionEvent[]): SessionEvent[] {
  let out: SessionEvent[] = [];
  for (const event of events) {
    out = upsertSessionEvent(out, event);
  }
  return out;
}
