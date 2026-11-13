/**
 * Moteur de synchronisation — inventaire, hash, plan, verrous (lots 3–5).
 */

export {
  normalizeMarkdownForHash,
  sha256Hex,
  contentHash,
} from "./hash.js";

export {
  buildMetadataCanonical,
  buildSourcePageUrl,
  buildUploadFilename,
  CONNECTOR_FOLDER,
  type PageMetadataInput,
} from "./metadata.js";

export {
  diffInventory,
  nextStateAfterInventory,
  emptyCounters,
  type RemotePageRef,
  type LocalPageRef,
  type InventoryAction,
  type InventoryDecision,
  type InventoryDiffResult,
  type SyncCounters,
} from "./inventory.js";

export {
  canAcquireLock,
  nextLease,
  SYNC_LOCK_KEY,
  DEFAULT_LEASE_MS,
  type LockLease,
} from "./locks.js";
