import type { AgentMode, SessionEvent } from "@atelier/contracts";

export type PendingUserTurn = {
  id: string;
  text: string;
  at: string;
  attachments: string[];
  mentions: string[];
  waitUntilCount: number;
  status: "sending" | "failed";
};

export type QueuedPrompt = {
  id: string;
  text: string;
  attachments: string[];
  mentions: string[];
  recipeId?: string;
  mode: AgentMode;
};

const PROGRESS_TYPES = new Set([
  "assistant_delta",
  "assistant_message",
  "tool_call",
  "plan",
  "question",
  "permission",
  "diff",
  "todos",
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

export function upsertSessionEvent(events: SessionEvent[], event: SessionEvent): SessionEvent[] {
  if (event.type === "assistant_delta") return events;
  if (event.type === "tool_call") {
    const index = events.findIndex((row) => row.type === "tool_call" && row.toolCallId === event.toolCallId);
    if (index >= 0) {
      const next = events.slice();
      next[index] = event;
      return next;
    }
  }
  if (events.some((row) => row.id === event.id && row.type === event.type)) return events;
  return [...events, event];
}
