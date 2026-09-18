import type { SessionEvent, UsageProfile, UsageSummary } from "@atelier/contracts";
import { billableTokens, estimateTokens, usageDayKey, usagePeriodKey, type UsageLedgerEntry } from "@atelier/domain";
import type { AcpPromptBlock } from "./acp/session.js";

/** Thrown before a run starts so the API can answer 429 instead of spawning an agent. */
export class UsageLimitError extends Error {
  readonly code = "usage_limit";

  constructor(readonly summary: UsageSummary) {
    super(`Usage limit reached: ${summary.decision.reason ?? "unknown"}`);
    this.name = "UsageLimitError";
  }
}

export interface RunMeter {
  inputTokens: number;
  outputTokens: number;
  contextPeakTokens: number;
  contextSize: number;
  /** ACP reports session-cumulative cost, so this is a running total, not a delta. */
  cumulativeCostUsd: number;
  toolCalls: number;
  sawProvider: boolean;
  seenToolCallIds: Set<string>;
  seenToolOutputIds: Set<string>;
}

export function createRunMeter(inputTokens = 0): RunMeter {
  return {
    inputTokens,
    outputTokens: 0,
    contextPeakTokens: 0,
    contextSize: 0,
    cumulativeCostUsd: 0,
    toolCalls: 0,
    sawProvider: false,
    seenToolCallIds: new Set(),
    seenToolOutputIds: new Set(),
  };
}

export function meterSessionEvent(meter: RunMeter, event: SessionEvent): void {
  if (event.type === "assistant_delta") {
    meter.outputTokens += estimateTokens(event.text);
    return;
  }
  if (event.type === "tool_call") {
    if (!meter.seenToolCallIds.has(event.toolCallId)) {
      meter.seenToolCallIds.add(event.toolCallId);
      meter.toolCalls += 1;
    }
    if (event.output && !meter.seenToolOutputIds.has(event.toolCallId)) {
      meter.seenToolOutputIds.add(event.toolCallId);
      meter.outputTokens += estimateTokens(event.output);
    }
    return;
  }
  if (event.type === "usage") {
    meter.sawProvider = true;
    meter.contextPeakTokens = Math.max(meter.contextPeakTokens, event.contextUsed);
    meter.contextSize = Math.max(meter.contextSize, event.contextSize);
    meter.cumulativeCostUsd = Math.max(meter.cumulativeCostUsd, event.costUsd);
  }
}

export function meterEstimatedTokens(meter: RunMeter): number {
  return meter.inputTokens + meter.outputTokens;
}

export function meterBillableTokens(meter: RunMeter, profile: UsageProfile): number {
  return billableTokens(
    { estimatedTokens: meterEstimatedTokens(meter), contextPeakTokens: meter.contextPeakTokens },
    profile.meter,
  );
}

/** Only the growth over the session baseline belongs to this run. */
export function costDelta(baseline: number, cumulative: number): number {
  if (!Number.isFinite(cumulative) || cumulative <= 0) return 0;
  const previous = Number.isFinite(baseline) && baseline > 0 ? baseline : 0;
  return Math.max(0, cumulative - previous);
}

export function estimatePromptBlockTokens(blocks: AcpPromptBlock[]): number {
  let tokens = 0;
  for (const block of blocks) {
    if (block.type === "text") tokens += estimateTokens(block.text ?? "");
    // An image costs tokens we cannot measure locally; charge its transport size.
    else if (block.type === "image") tokens += Math.ceil((block.data?.length ?? 0) / 750);
  }
  return tokens;
}

export function ledgerEntryFromMeter(input: {
  id: string;
  meter: RunMeter;
  userId: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  provider: string;
  costUsd: number;
  at?: Date;
  tz?: string;
}): UsageLedgerEntry {
  const at = input.at ?? new Date();
  return {
    id: input.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    runId: input.runId,
    provider: input.provider,
    at: at.toISOString(),
    periodKey: usagePeriodKey(at, input.tz),
    dayKey: usageDayKey(at, input.tz),
    inputTokens: input.meter.inputTokens,
    outputTokens: input.meter.outputTokens,
    estimatedTokens: meterEstimatedTokens(input.meter),
    contextPeakTokens: input.meter.contextPeakTokens,
    costUsd: Math.round(input.costUsd * 1_000_000) / 1_000_000,
    toolCalls: input.meter.toolCalls,
    source: input.meter.sawProvider ? "mixed" : "estimated",
  };
}
