"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BATCH_QUEUE_TIMEOUT_ERROR = exports.BATCH_QUEUE_TIMEOUT_MS = void 0;
exports.isUnfinishedBatchItemStatus = isUnfinishedBatchItemStatus;
exports.isBatchTimedOut = isBatchTimedOut;
exports.BATCH_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;
exports.BATCH_QUEUE_TIMEOUT_ERROR = "Batch exceeded the 10 minute queue limit. The unfinished task was cleared as timed out.";
const UNFINISHED_BATCH_ITEM_STATUSES = new Set(["queued", "creating", "pending", "running", "paused"]);
function isUnfinishedBatchItemStatus(status) {
    return UNFINISHED_BATCH_ITEM_STATUSES.has(status);
}
function isBatchTimedOut(createdAt, now = new Date()) {
    const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
    const nowMs = now.getTime();
    return Number.isFinite(createdAtMs)
        && Number.isFinite(nowMs)
        && nowMs - createdAtMs > exports.BATCH_QUEUE_TIMEOUT_MS;
}
