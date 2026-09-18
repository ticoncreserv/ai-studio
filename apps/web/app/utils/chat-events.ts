import type { AgentMode, InspectPin, SessionEvent } from "@atelier/contracts";
import {
  collapseSessionEvents,
  sessionEventKey,
  upsertSessionEvent,
} from "@atelier/domain";

export { collapseSessionEvents, sessionEventKey, upsertSessionEvent };

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

export type ToolCallEvent = Extract<SessionEvent, { type: "tool_call" }>;
export type AssistantEvent = Extract<SessionEvent, { type: "assistant_message" | "assistant_delta" }>;

export type ChatBlock =
  | { type: "event"; event: SessionEvent }
  | { type: "tools"; events: ToolCallEvent[] }
  | { type: "assistant"; events: AssistantEvent[] };

export type AssistantVoice = "process" | "reply";

function isAssistantEvent(event: SessionEvent): event is AssistantEvent {
  return event.type === "assistant_message" || event.type === "assistant_delta";
}

export function groupChatBlocks(events: SessionEvent[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (const event of events) {
    if (event.type === "run") continue;
    if (event.type === "tool_call") {
      const last = blocks.at(-1);
      if (last?.type === "tools") last.events.push(event);
      else blocks.push({ type: "tools", events: [event] });
      continue;
    }
    if (isAssistantEvent(event)) {
      const last = blocks.at(-1);
      if (last?.type === "assistant") last.events.push(event);
      else blocks.push({ type: "assistant", events: [event] });
      continue;
    }
    blocks.push({ type: "event", event });
  }
  return blocks;
}

export function assistantBlockText(events: AssistantEvent[]): string {
  return events
    .map((event) => event.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function turnSliceAround(events: SessionEvent[], index: number): SessionEvent[] {
  let start = 0;
  for (let i = index; i >= 0; i--) {
    if (events[i]?.type === "user_message") {
      start = i;
      break;
    }
  }
  let end = events.length;
  for (let i = index + 1; i < events.length; i++) {
    if (events[i]?.type === "user_message") {
      end = i;
      break;
    }
  }
  return events.slice(start, end);
}

export function assistantBlockVoice(
  events: SessionEvent[],
  block: Extract<ChatBlock, { type: "assistant" }>,
): AssistantVoice {
  const firstId = block.events[0]?.id;
  if (!firstId) return "reply";
  const index = events.findIndex((event) => event.id === firstId);
  if (index < 0) return "reply";
  const turnBlocks = groupChatBlocks(turnSliceAround(events, index)).filter(
    (item): item is Extract<ChatBlock, { type: "assistant" }> => item.type === "assistant",
  );
  if (turnBlocks.length <= 1) return "reply";
  return turnBlocks.at(-1)?.events[0]?.id === firstId ? "reply" : "process";
}

export function turnActionsEventId(events: SessionEvent[]): string | null {
  if (isSessionRunActive(events)) return null;
  let lastUser = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i]?.type === "user_message") lastUser = i;
  }
  if (lastUser < 0) return null;
  let lastId: string | null = null;
  for (const event of events.slice(lastUser + 1)) {
    if (event.type === "assistant_message") lastId = event.id;
  }
  return lastId;
}

export function mergeSessionEvents(server: SessionEvent[], local: SessionEvent[]): SessionEvent[] {
  let merged = collapseSessionEvents(server);
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
