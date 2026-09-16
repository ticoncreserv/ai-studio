import type { Hunk, SessionEvent, TodoItem } from "@atelier/contracts";

export interface SessionState {
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; streaming?: boolean }>;
  toolCalls: Array<{ id: string; name: string; status: string; output?: string }>;
  hunks: Hunk[];
  todos: TodoItem[];
  plan: { id: string; plan: string; outcome: string } | null;
  question: Extract<SessionEvent, { type: "question" }> | null;
  permission: Extract<SessionEvent, { type: "permission" }> | null;
  checkpoints: Array<{ id: string; gitSha: string; label: string }>;
  errors: Array<{ id: string; message: string; source: string }>;
  conflicts: string[];
  omittedContext: string[];
  budgetCut: string | null;
}

export const emptySession = (): SessionState => ({
  messages: [],
  toolCalls: [],
  hunks: [],
  todos: [],
  plan: null,
  question: null,
  permission: null,
  checkpoints: [],
  errors: [],
  conflicts: [],
  omittedContext: [],
  budgetCut: null,
});

export function reduceSession(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "user_message":
      return {
        ...state,
        messages: [...state.messages, { id: event.id, role: "user", text: event.text }],
      };
    case "assistant_message": {
      const existing = state.messages.find((m) => m.id === event.id);
      if (existing) {
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === event.id ? { ...m, text: event.text, streaming: event.streaming } : m,
          ),
        };
      }
      return {
        ...state,
        messages: [...state.messages, { id: event.id, role: "assistant", text: event.text, streaming: event.streaming }],
      };
    }
    case "assistant_delta": {
      const last = [...state.messages].reverse().find((m) => m.role === "assistant");
      if (!last) {
        return {
          ...state,
          messages: [...state.messages, { id: event.id, role: "assistant", text: event.text, streaming: true }],
        };
      }
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === last.id ? { ...m, text: m.text + event.text, streaming: true } : m,
        ),
      };
    }
    case "tool_call": {
      const found = state.toolCalls.find((t) => t.id === event.toolCallId);
      if (found) {
        return {
          ...state,
          toolCalls: state.toolCalls.map((t) =>
            t.id === event.toolCallId
              ? { ...t, status: event.status, output: event.output ?? t.output, name: event.name }
              : t,
          ),
        };
      }
      return {
        ...state,
        toolCalls: [...state.toolCalls, { id: event.toolCallId, name: event.name, status: event.status, output: event.output }],
      };
    }
    case "diff":
      return { ...state, hunks: [...state.hunks.filter((h) => h.filePath !== event.filePath), ...event.hunks] };
    case "todos":
      return {
        ...state,
        todos: event.merge
          ? mergeTodos(state.todos, event.todos)
          : event.todos,
      };
    case "plan":
      return { ...state, plan: { id: event.id, plan: event.plan, outcome: event.outcome } };
    case "question":
      return { ...state, question: event };
    case "permission":
      return { ...state, permission: event };
    case "runtime_error":
      return { ...state, errors: [...state.errors, { id: event.id, message: event.message, source: event.source }] };
    case "checkpoint":
      return { ...state, checkpoints: [...state.checkpoints, { id: event.id, gitSha: event.gitSha, label: event.label }] };
    case "conflict":
      return { ...state, conflicts: event.files };
    case "dropped_context":
      return { ...state, omittedContext: event.omitted };
    case "budget":
      return { ...state, budgetCut: event.message };
    case "migration":
      return state;
    default:
      return state;
  }
}

function mergeTodos(current: TodoItem[], incoming: TodoItem[]): TodoItem[] {
  const map = new Map(current.map((t) => [t.id, t]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

export function applyHunkDecision(state: SessionState, hunkId: string, status: "accepted" | "rejected"): SessionState {
  return {
    ...state,
    hunks: state.hunks.map((h) => (h.id === hunkId ? { ...h, status } : h)),
  };
}

export function applyFileDecision(state: SessionState, filePath: string, status: "accepted" | "rejected"): SessionState {
  return {
    ...state,
    hunks: state.hunks.map((h) => (h.filePath === filePath ? { ...h, status } : h)),
  };
}

export function foldEvents(events: SessionEvent[]): SessionState {
  return events.filter((e) => e.type !== "assistant_delta" && e.type !== "available_skills").reduce(reduceSession, emptySession());
}
