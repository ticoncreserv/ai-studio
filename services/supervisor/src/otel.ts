export interface Span {
  name: string;
  startedAt: number;
  attributes: Record<string, string | number | boolean>;
  end: (extra?: Record<string, string | number | boolean>) => void;
}

const usageLog: Array<{ sessionId: string; tokens: number; costUsd: number; toolCalls: number; at: string }> = [];

export function startSpan(name: string, attributes: Record<string, string | number | boolean> = {}): Span {
  const startedAt = Date.now();
  return {
    name,
    startedAt,
    attributes,
    end(extra = {}) {
      const durationMs = Date.now() - startedAt;
      const record = { name, durationMs, ...attributes, ...extra };
      if (process.env.OTEL_LOG === "1") {
        console.info("[otel]", JSON.stringify(record));
      }
    },
  };
}

export function recordUsage(input: { sessionId: string; tokens: number; costUsd: number; toolCalls: number }): void {
  usageLog.push({ ...input, at: new Date().toISOString() });
}

export function usageForSession(sessionId: string) {
  return usageLog.filter((u) => u.sessionId === sessionId);
}
