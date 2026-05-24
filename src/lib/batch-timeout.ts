import type { ImageBatchItemStatus } from "./types";

export const BATCH_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
export const BATCH_QUEUE_TIMEOUT_ERROR = "Batch exceeded the 10 minute queue limit. The unfinished task was cleared as timed out.";

const UNFINISHED_BATCH_ITEM_STATUSES = new Set(["queued", "creating", "pending", "running", "paused"]);

export function isUnfinishedBatchItemStatus(status: ImageBatchItemStatus | string) {
  return UNFINISHED_BATCH_ITEM_STATUSES.has(status);
}

export function isBatchTimedOut(createdAt: Date | string, now = new Date()) {
  const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  const nowMs = now.getTime();

  return Number.isFinite(createdAtMs)
    && Number.isFinite(nowMs)
    && nowMs - createdAtMs > BATCH_QUEUE_TIMEOUT_MS;
}
