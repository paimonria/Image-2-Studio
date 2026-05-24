import type { ImageBatchStatus, ImageBatchItemStatus, ImageJobStatus } from "./types";

export function isActiveImageJobStatus(status: ImageJobStatus | string) {
  return status === "pending" || status === "running";
}

export function isPausableImageJobStatus(status: ImageJobStatus | string) {
  return status === "pending";
}

export function isResumableImageJobStatus(status: ImageJobStatus | string) {
  return status === "paused";
}

export function isRetryableImageJobStatus(status: ImageJobStatus | string) {
  return status === "failed";
}

export function isForceKillableImageJobStatus(status: ImageJobStatus | string) {
  return status === "pending" || status === "running" || status === "paused";
}

export function isRetryableBatchItemStatus(status: ImageBatchItemStatus | string) {
  return status === "failed";
}

export function resolveImageBatchStatusFromItemStatuses(statuses: Array<ImageBatchItemStatus | string>): ImageBatchStatus {
  if (statuses.length === 0) return "queued";

  const successCount = statuses.filter((status) => status === "succeeded").length;
  const failedCount = statuses.filter((status) => status === "failed").length;
  const activeCount = statuses.filter((status) => (
    status === "queued" ||
    status === "creating" ||
    status === "pending" ||
    status === "running"
  )).length;
  const pausedCount = statuses.filter((status) => status === "paused").length;
  const finishedCount = successCount + failedCount;

  if (finishedCount === 0 && pausedCount === 0) return "queued";
  if (finishedCount < statuses.length && activeCount === 0 && pausedCount > 0) return "paused";
  if (finishedCount < statuses.length) return "running";
  if (failedCount === 0) return "succeeded";
  if (successCount === 0) return "failed";
  return "partial";
}
