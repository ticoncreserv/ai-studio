import type { ClientCommand } from "@atelier/contracts";
import type { PreviewDebug } from "~/types/studio";

const SLOW_TIME_MS = 200;
const SLOW_QUERY_COUNT = 10;

export type PreviewDebugTranslate = (key: string, values?: Record<string, unknown>) => string;

export function isSlowPreviewRequest(debug: PreviewDebug | null | undefined): boolean {
  return (debug?.timeMs ?? 0) >= SLOW_TIME_MS || (debug?.queries ?? 0) >= SLOW_QUERY_COUNT;
}

function snapshotLines(debug: PreviewDebug | null | undefined, t: PreviewDebugTranslate): string[] {
  const lines: string[] = [];
  if (debug?.method || debug?.uri) lines.push(`${debug.method ?? "GET"} ${debug.uri ?? ""}`.trim());
  if (debug?.timeMs != null) lines.push(t("preview.debugPrompt.time", { ms: debug.timeMs }));
  if (debug?.queries != null) lines.push(t("preview.debugPrompt.queries", { count: debug.queries }));
  if (debug?.queryMs != null) lines.push(t("preview.debugPrompt.queryTime", { ms: debug.queryMs }));
  if (debug?.memoryMb != null) lines.push(t("preview.debugPrompt.memory", { mb: debug.memoryMb }));
  if (debug?.nPlusOne) lines.push(t("preview.debugPrompt.nPlusOneYes"));
  if (debug?.route?.controller) lines.push(t("preview.debugPrompt.controller", { name: debug.route.controller }));
  if (debug?.inertiaComponent) lines.push(t("preview.debugPrompt.inertia", { component: debug.inertiaComponent }));
  const duplicates = debug?.duplicates ?? [];
  if (duplicates.length) {
    lines.push(t("preview.debugPrompt.duplicates"));
    for (const row of duplicates) lines.push(`- ${t("preview.debugDuplicate", { count: row.count, sql: row.sql })}`);
  }
  const slow = [...(debug?.statements ?? [])]
    .filter((row) => row.durationMs != null)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 8);
  if (slow.length) {
    lines.push(t("preview.debugPrompt.slowest"));
    for (const row of slow) lines.push(`- ${row.durationMs}ms ${row.sql}`);
  }
  return lines;
}

export function formatPreviewDebugPrompt(debug: PreviewDebug | null | undefined, t: PreviewDebugTranslate): string {
  return [t("preview.debugPrompt.nPlusOne"), ...snapshotLines(debug, t)].join("\n");
}

export function formatSlowRequestPrompt(debug: PreviewDebug | null | undefined, t: PreviewDebugTranslate): string {
  return [t("preview.debugPrompt.slow"), ...snapshotLines(debug, t)].join("\n");
}

export function formatQueryPrompt(sql: string, debug: PreviewDebug | null | undefined, t: PreviewDebugTranslate): string {
  const lines = [t("preview.debugPrompt.query"), t("preview.debugPrompt.sql", { sql })];
  if (debug?.uri) lines.push(t("preview.debugPrompt.uri", { uri: debug.uri }));
  if (debug?.inertiaComponent) lines.push(t("preview.debugPrompt.inertia", { component: debug.inertiaComponent }));
  return lines.join("\n");
}

export type PreviewDebugAction = "nplusone" | "slow" | "query" | "fix";

export function previewDebugCommand(
  action: PreviewDebugAction,
  debug: PreviewDebug | null | undefined,
  t: PreviewDebugTranslate,
  runtimeErrorId?: string,
  sql?: string,
): ClientCommand {
  if (action === "fix" && runtimeErrorId) return { type: "fix_error", eventId: runtimeErrorId };
  const text =
    action === "query" && sql
      ? formatQueryPrompt(sql, debug, t)
      : action === "slow"
        ? formatSlowRequestPrompt(debug, t)
        : formatPreviewDebugPrompt(debug, t);
  return { type: "prompt", text, attachments: [], mentions: [] };
}

export function previewFixCommand(
  debug: PreviewDebug | null | undefined,
  t: PreviewDebugTranslate,
  runtimeErrorId?: string,
): ClientCommand {
  return previewDebugCommand(runtimeErrorId ? "fix" : "nplusone", debug, t, runtimeErrorId);
}
