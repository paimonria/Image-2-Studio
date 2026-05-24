"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINISHED_IMAGE_JOB_STATUSES = void 0;
exports.isFinishedImageJobStatus = isFinishedImageJobStatus;
exports.getImageJobMonitorFinishedAtMs = getImageJobMonitorFinishedAtMs;
exports.isImageJobVisibleAfterFinishedClear = isImageJobVisibleAfterFinishedClear;
exports.filterImageJobsAfterFinishedClear = filterImageJobsAfterFinishedClear;
exports.buildFinishedJobAfterClearFilter = buildFinishedJobAfterClearFilter;
exports.buildFinishedJobVisibilityFilter = buildFinishedJobVisibilityFilter;
exports.buildVisibleFinishedJobWhere = buildVisibleFinishedJobWhere;
exports.FINISHED_IMAGE_JOB_STATUSES = ["succeeded", "failed"];
function isFinishedImageJobStatus(status) {
    return status === "succeeded" || status === "failed";
}
function parseClearTime(value) {
    if (!value)
        return null;
    const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}
function getImageJobMonitorFinishedAtMs(job) {
    const finishedAtMs = parseClearTime(job.finishedAt);
    if (finishedAtMs !== null)
        return finishedAtMs;
    return parseClearTime(job.createdAt);
}
function isImageJobVisibleAfterFinishedClear(job, clearedAt) {
    if (!isFinishedImageJobStatus(job.status))
        return true;
    const clearedAtMs = parseClearTime(clearedAt);
    if (clearedAtMs === null)
        return true;
    const finishedAtMs = getImageJobMonitorFinishedAtMs(job);
    return finishedAtMs !== null && finishedAtMs > clearedAtMs;
}
function filterImageJobsAfterFinishedClear(jobs, clearedAt) {
    return jobs.filter((job) => isImageJobVisibleAfterFinishedClear(job, clearedAt));
}
function buildFinishedJobAfterClearFilter(clearedAt) {
    if (!clearedAt)
        return null;
    return {
        OR: [
            { finishedAt: { gt: clearedAt } },
            {
                finishedAt: null,
                createdAt: { gt: clearedAt }
            }
        ]
    };
}
function buildFinishedJobVisibilityFilter(clearedAt) {
    if (!clearedAt)
        return null;
    return {
        OR: [
            { status: { notIn: [...exports.FINISHED_IMAGE_JOB_STATUSES] } },
            { finishedAt: { gt: clearedAt } },
            {
                finishedAt: null,
                createdAt: { gt: clearedAt }
            }
        ]
    };
}
function buildVisibleFinishedJobWhere(userId, clearedAt) {
    return {
        userId,
        status: { in: [...exports.FINISHED_IMAGE_JOB_STATUSES] },
        ...(buildFinishedJobAfterClearFilter(clearedAt) ?? {})
    };
}
