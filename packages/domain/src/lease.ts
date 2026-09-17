export interface WorkspaceLease {
  sessionId: string;
  userId: string;
  leaseUntil: string;
  heartbeatAt?: string;
}

export const DEFAULT_LEASE_MS = 120_000;

export function createLease(
  sessionId: string,
  userId: string,
  now = Date.now(),
  ttlMs = DEFAULT_LEASE_MS,
): WorkspaceLease {
  const at = new Date(now).toISOString();
  return {
    sessionId,
    userId,
    heartbeatAt: at,
    leaseUntil: new Date(now + ttlMs).toISOString(),
  };
}

export function heartbeatLease(lease: WorkspaceLease, now = Date.now(), ttlMs = DEFAULT_LEASE_MS): WorkspaceLease {
  return createLease(lease.sessionId, lease.userId, now, ttlMs);
}

export function leaseExpired(lease: WorkspaceLease | undefined, now = Date.now()): boolean {
  if (!lease?.leaseUntil) return true;
  return Date.parse(lease.leaseUntil) <= now;
}

export function canAcquireLease(
  lease: WorkspaceLease | undefined,
  sessionId: string,
  now = Date.now(),
): boolean {
  if (!lease) return true;
  if (lease.sessionId === sessionId) return true;
  return leaseExpired(lease, now);
}
