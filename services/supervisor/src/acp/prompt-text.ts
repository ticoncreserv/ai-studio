import type { SessionEvent } from "@atelier/contracts";

export function shouldFlushAssistantText(event: SessionEvent): boolean {
  if (event.type === "tool_call") return event.status === "running";
  return event.type === "plan" || event.type === "question" || event.type === "permission";
}

export class PromptTextBuffer {
  private readonly chunks = new Map<string, string>();

  reset(sessionId: string): void {
    this.chunks.set(sessionId, "");
  }

  append(sessionId: string, text: string): void {
    this.chunks.set(sessionId, (this.chunks.get(sessionId) ?? "") + text);
  }

  take(sessionId: string): string {
    const text = (this.chunks.get(sessionId) ?? "").trim();
    this.chunks.set(sessionId, "");
    return text;
  }
}

export function collectAssistantReplies(events: SessionEvent[]): string[] {
  const buffer = new PromptTextBuffer();
  const sessionId = "session";
  const replies: string[] = [];
  buffer.reset(sessionId);
  for (const event of events) {
    if (event.type === "assistant_delta") buffer.append(sessionId, event.text);
    if (shouldFlushAssistantText(event)) {
      const text = buffer.take(sessionId);
      if (text) replies.push(text);
    }
  }
  const text = buffer.take(sessionId);
  if (text) replies.push(text);
  return replies;
}
