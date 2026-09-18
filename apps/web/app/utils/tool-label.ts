import type { SessionEvent } from "@atelier/contracts";
import { mcpServerFromToolName } from "./slash";

export const TOOL_KINDS = ["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "other"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

type ToolCallEvent = Extract<SessionEvent, { type: "tool_call" }>;

const KIND_SET = new Set<string>(TOOL_KINDS);

export function knownToolKind(value: string | undefined): ToolKind | null {
  if (!value) return null;
  return KIND_SET.has(value) ? (value as ToolKind) : null;
}

export function toolDisplayName(name: string): string {
  const cleaned = name.replaceAll("`", "").trim();
  const mcp = cleaned.match(/^mcp[_-]([a-z0-9][a-z0-9-]*)[_-](.+)$/i);
  if (mcp?.[2]) return mcp[2];
  return cleaned;
}

export function toolTargetLabel(target: string | undefined): string {
  if (!target) return "";
  const trimmed = target.trim();
  if (!trimmed) return "";
  if (/[/\\]/.test(trimmed)) return trimmed.split(/[/\\]/).pop() || trimmed;
  return trimmed;
}

export function toolCallPresentation(event: ToolCallEvent): {
  verbKey: string | null;
  name: string;
  target: string;
  title: string;
} {
  const name = toolDisplayName(event.name);
  const kind = knownToolKind(event.kind);
  const verbKey =
    kind && kind !== "other"
      ? event.status === "running"
        ? `chat.tool.${kind}Running`
        : `chat.tool.${kind}`
      : null;
  let target = toolTargetLabel(event.target);
  if (target && name.toLowerCase().includes(target.toLowerCase())) target = "";
  const title = [event.target || target || name, mcpServerFromToolName(event.name)].filter(Boolean).join(" · ");
  return { verbKey, name, target, title };
}
