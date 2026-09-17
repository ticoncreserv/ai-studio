import type { AgentRunStatus } from "@atelier/contracts";

const TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["reviewing", "validating", "failed", "cancelled"],
  reviewing: ["validating", "accepted", "rejected", "failed", "cancelled"],
  validating: ["accepted", "failed", "cancelled"],
  accepted: ["pushed", "failed"],
  pushed: [],
  rejected: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRun(from: AgentRunStatus, to: AgentRunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionRun(from: AgentRunStatus, to: AgentRunStatus): AgentRunStatus {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Cannot move agent run from ${from} to ${to}`);
  }
  return to;
}

export function isTerminalRun(status: AgentRunStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function hasPendingProposal(hunks: Array<{ status: string }>): boolean {
  return hunks.some((hunk) => hunk.status === "pending");
}
