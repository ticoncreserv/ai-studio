import type { WorkspaceStatus } from "@atelier/contracts";

const transitions: Record<WorkspaceStatus, WorkspaceStatus[]> = {
  provisioning: ["ready", "error", "destroyed"],
  ready: ["running", "hibernated", "error", "destroyed"],
  running: ["ready", "hibernated", "error", "destroyed"],
  hibernated: ["ready", "running", "destroyed"],
  error: ["provisioning", "destroyed"],
  destroyed: [],
};

export function canTransition(from: WorkspaceStatus, to: WorkspaceStatus): boolean {
  return transitions[from].includes(to);
}

export function transition(from: WorkspaceStatus, to: WorkspaceStatus): WorkspaceStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal workspace transition: ${from} -> ${to}`);
  }
  return to;
}
