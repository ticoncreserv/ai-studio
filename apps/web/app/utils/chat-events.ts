import type { AgentMode, InspectPin, SessionEvent } from "@atelier/contracts";

export type PendingUserTurn = {
  id: string;
  text: string;
  at: string;
  attachments: string[];
  mentions: string[];
  inspect?: InspectPin[];
  skill?: string;
  waitUntilCount: number;
  status: "sending" | "failed";
};

export type QueuedPrompt = {
  id: string;
  text: string;
  attachments: string[];
  mentions: string[];
  inspect?: InspectPin[];
  recipeId?: string;
  skill?: string;
  mode: AgentMode;
};

export const CHAT_SOCKET_PING_MS = 20_000;
export const CHAT_POLL_DISCONNECTED_MS = 2_000;
export const CHAT_POLL_CONNECTED_MS = 15_000;
export const CHAT_RECONNECT_MIN_MS = 500;
export const CHAT_RECONNECT_MAX_MS = 10_000;

const PROGRESS_TYPES = new Set([
  "assistant_delta",
  "assistant_message",
  "tool_call",
  "plan",
  "question",
  "permission",
  "diff",
  "todos",
  "run",
  "proposal",
  "validation",
]);

export function userMessageCount(events: SessionEvent[]): number {
  return events.filter((event) => event.type === "user_message").length;
}

export function mergePendingTurn(events: SessionEvent[], pending: PendingUserTurn | null): SessionEvent[] {
  if (!pending) return events;
  const confirmed = userMessageCount(events) >= pending.waitUntilCount;
  if (confirmed && pending.status !== "failed") return events;
  if (events.some((event) => event.id === pending.id)) return events;
  return [
    ...events,
    {
      type: "user_message",
      id: pending.id,
      at: pending.at,
      text: pending.text,
      attachments: pending.attachments,
      mentions: pending.mentions,
      skill: pending.skill,
      ...(pending.inspect?.length ? { inspect: pending.inspect } : {}),
    },
  ];
}

export function hasProgressAfterLastUser(events: SessionEvent[]): boolean {
  let lastUser = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type === "user_message") lastUser = i;
  }
  if (lastUser < 0) return false;
  return events.slice(lastUser + 1).some((event) => PROGRESS_TYPES.has(event.type));
}

export function sessionEventKey(event: SessionEvent): string {
  if (event.type === "tool_call") return `tool_call:${event.toolCallId}`;
  return `${event.type}:${event.id}`;
}

function preferSessionEvent(current: SessionEvent, incoming: SessionEvent): SessionEvent {
  if (current.type === "tool_call" && incoming.type === "tool_call") {
    if (current.status !== "running" && incoming.status === "running") return current;
    return incoming;
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

export function mergeSessionEvents(server: SessionEvent[], local: SessionEvent[]): SessionEvent[] {
  let merged = server.slice();
  for (const event of local) {
    merged = upsertSessionEvent(merged, event);
  }
  return merged;
}

const LIVE_EVENT_TYPES = new Set<SessionEvent["type"]>([
  "user_message",
  "assistant_message",
  "assistant_delta",
  "tool_call",
  "diff",
  "todos",
  "plan",
  "question",
  "permission",
  "runtime_error",
  "checkpoint",
  "migration",
  "budget",
  "usage",
  "conflict",
  "dropped_context",
  "run",
  "proposal",
  "validation",
  "run_failure",
  "prompt_manifest",
  "push",
  "available_skills",
]);

export function isLiveSessionEvent(payload: unknown): payload is SessionEvent {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const type = (payload as { type?: unknown }).type;
  return typeof type === "string" && LIVE_EVENT_TYPES.has(type as SessionEvent["type"]);
}

export function nextReconnectDelay(current: number): number {
  return Math.min(Math.max(current, CHAT_RECONNECT_MIN_MS) * 2, CHAT_RECONNECT_MAX_MS);
}

export function isSessionRunActive(events: SessionEvent[]): boolean {
  let lastUser = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type === "user_message") lastUser = i;
  }
  if (lastUser < 0) return false;
  const after = events.slice(lastUser + 1);
  if (after.some((event) => event.type === "run_failure")) return false;
  const lastRun = [...after].reverse().find((event) => event.type === "run");
  return lastRun?.type === "run" && lastRun.status === "running";
}

export function isComposerBusy(input: {
  events: SessionEvent[];
  pendingStatus?: PendingUserTurn["status"] | null;
  submitting?: boolean;
}): boolean {
  if (input.submitting) return true;
  if (input.pendingStatus === "sending") return true;
  return isSessionRunActive(input.events);
}

export function shouldShowWorking(input: { inFlight: boolean; events: SessionEvent[] }): boolean {
  return input.inFlight && !hasProgressAfterLastUser(input.events);
}

export function workingSinceMs(input: {
  inFlight: boolean;
  pending?: PendingUserTurn | null;
  events: SessionEvent[];
}): number | null {
  if (!input.inFlight) return null;
  if (input.pending?.status === "sending") {
    const parsed = Date.parse(input.pending.at);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  const runAt = [...input.events].reverse().find((event) => event.type === "run" && event.status === "running");
  if (runAt) {
    const parsed = Date.parse(runAt.at);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }
  return Date.now();
}
