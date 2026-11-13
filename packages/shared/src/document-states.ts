export const DOCUMENT_STATES = [
  "NEW",
  "SYNCED",
  "OUTDATED",
  "PROCESSING",
  "ERROR",
  "PENDING_REMOVAL",
  "ACCESS_REVIEW",
  "REMOVED",
] as const;

export type DocumentState = (typeof DOCUMENT_STATES)[number];

export const SYNC_RUN_STATUSES = ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];
