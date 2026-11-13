export type LockLease = {
  key: string;
  owner: string;
  leaseUntil: Date;
  heartbeatAt: Date;
};

export const SYNC_LOCK_KEY = "sync-engine";

/** Durée de bail par défaut (ms). */
export const DEFAULT_LEASE_MS = 5 * 60_000;

/** Renouvelle le bail si le propriétaire courant est le nôtre ou si le bail a expiré. */
export function canAcquireLock(params: {
  existing: LockLease | null;
  owner: string;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (!params.existing) return true;
  if (params.existing.owner === params.owner) return true;
  return params.existing.leaseUntil.getTime() <= now.getTime();
}

export function nextLease(owner: string, leaseMs = DEFAULT_LEASE_MS, now = new Date()): LockLease {
  return {
    key: SYNC_LOCK_KEY,
    owner,
    leaseUntil: new Date(now.getTime() + leaseMs),
    heartbeatAt: now,
  };
}
