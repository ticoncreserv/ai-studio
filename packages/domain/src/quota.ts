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

export function shouldCollect(idleMs: number, policy: DiskPolicy): boolean {
  return idleMs >= policy.destroyAfterMs;
}

export function overDiskQuota(bytes: number, policy: DiskPolicy): boolean {
  return bytes > policy.maxBytesPerWorkspace;
}
