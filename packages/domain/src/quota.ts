export interface DiskPolicy {
  maxWorkspacesPerUser: number;
  hibernateAfterMs: number;
  destroyAfterMs: number;
  maxBytesPerWorkspace: number;
}

export const defaultDiskPolicy = (): DiskPolicy => ({
  maxWorkspacesPerUser: 4,
  hibernateAfterMs: 30 * 60 * 1000,
  destroyAfterMs: 14 * 24 * 60 * 60 * 1000,
  maxBytesPerWorkspace: 3 * 1024 * 1024 * 1024,
});

export function shouldHibernate(idleMs: number, policy: DiskPolicy): boolean {
  return idleMs >= policy.hibernateAfterMs;
}

/** Opening a studio workspace wakes preview unless the user pinned hibernate. */
export function shouldAutoResumePreview(workspace: {
  status: string;
  hibernatedByUser?: boolean;
  previewProcessRunning?: boolean;
}): boolean {
  if (workspace.hibernatedByUser) return false;
  if (workspace.status === "destroyed" || workspace.status === "provisioning") return false;
  if (workspace.previewProcessRunning) return false;
  return (
    workspace.status === "hibernated" ||
    workspace.status === "ready" ||
    workspace.status === "error" ||
    workspace.status === "running"
  );
}

/** Login/open must not clobber a running preview or a user-pinned hibernate. */
export function shouldResetToReadyOnWarm(workspace: {
  status: string;
  hibernatedByUser?: boolean;
}): boolean {
  if (workspace.hibernatedByUser) return false;
  return workspace.status !== "running" && workspace.status !== "provisioning";
}

export function shouldCollect(idleMs: number, policy: DiskPolicy): boolean {
  return idleMs >= policy.destroyAfterMs;
}

export function overDiskQuota(bytes: number, policy: DiskPolicy): boolean {
  return bytes > policy.maxBytesPerWorkspace;
}
