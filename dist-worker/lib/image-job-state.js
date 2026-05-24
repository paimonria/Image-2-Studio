"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isActiveImageJobStatus = isActiveImageJobStatus;
exports.isPausableImageJobStatus = isPausableImageJobStatus;
exports.isResumableImageJobStatus = isResumableImageJobStatus;
exports.isRetryableImageJobStatus = isRetryableImageJobStatus;
exports.isForceKillableImageJobStatus = isForceKillableImageJobStatus;
exports.isRetryableBatchItemStatus = isRetryableBatchItemStatus;
exports.resolveImageBatchStatusFromItemStatuses = resolveImageBatchStatusFromItemStatuses;
function isActiveImageJobStatus(status) {
    return status === "pending" || status === "running";
}
function isPausableImageJobStatus(status) {
    return status === "pending";
}
function isResumableImageJobStatus(status) {
    return status === "paused";
}
function isRetryableImageJobStatus(status) {
    return status === "failed";
}
function isForceKillableImageJobStatus(status) {
    return status === "pending" || status === "running" || status === "paused";
}
function isRetryableBatchItemStatus(status) {
    return status === "failed";
}
function resolveImageBatchStatusFromItemStatuses(statuses) {
    if (statuses.length === 0)
        return "queued";
    const successCount = statuses.filter((status) => status === "succeeded").length;
    const failedCount = statuses.filter((status) => status === "failed").length;
    const activeCount = statuses.filter((status) => (status === "queued" ||
        status === "creating" ||
        status === "pending" ||
        status === "running")).length;
    const pausedCount = statuses.filter((status) => status === "paused").length;
    const finishedCount = successCount + failedCount;
    if (finishedCount === 0 && pausedCount === 0)
        return "queued";
    if (finishedCount < statuses.length && activeCount === 0 && pausedCount > 0)
        return "paused";
    if (finishedCount < statuses.length)
        return "running";
    if (failedCount === 0)
        return "succeeded";
    if (successCount === 0)
        return "failed";
    return "partial";
}
