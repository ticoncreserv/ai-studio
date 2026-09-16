export function formatAgentError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (!error || typeof error !== "object") return "The Cursor agent failed.";

  const payload = error as { message?: unknown; data?: unknown; code?: unknown };
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const detail = formatRpcData(payload.data);
  if (message && detail) return `${message}: ${detail}`;
  if (message) return message;
  if (detail) return detail;
  return "The Cursor agent failed.";
}

function formatRpcData(data: unknown): string {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!Array.isArray(data)) return "";
  const parts = data
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { message?: unknown; path?: unknown };
      const path = Array.isArray(row.path) ? row.path.map(String).join(".") : "";
      const message = typeof row.message === "string" ? row.message : "";
      if (path && message) return `${path}: ${message}`;
      return message || path;
    })
    .filter(Boolean);
  return parts.join("; ");
}

export function toAgentError(error: unknown): Error {
  return error instanceof Error ? error : new Error(formatAgentError(error));
}
