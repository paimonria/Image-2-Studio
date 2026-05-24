"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT = void 0;
exports.ensurePendingImageJobScheduled = ensurePendingImageJobScheduled;
exports.repairPendingImageJobSchedules = repairPendingImageJobSchedules;
exports.repairPendingBatchItemSchedules = repairPendingBatchItemSchedules;
exports.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT = 30;
function normalizeRepairLimit(limit) {
    if (!Number.isFinite(limit))
        return exports.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT;
    return Math.min(Math.max(Math.trunc(limit ?? exports.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT), 1), 100);
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error || "unknown error");
}
function getWarningDetails(jobId, context, error) {
    return {
        jobId,
        source: context.source,
        batchId: context.batchId,
        cause: getErrorMessage(error)
    };
}
async function ensurePendingImageJobScheduled(jobId, context, deps) {
    if (deps.isRedisQueueEnabled()) {
        try {
            await deps.enqueueRedisJob(jobId);
            return {
                mode: "redis",
                scheduled: true
            };
        }
        catch (error) {
            deps.warn?.("[images/jobs] pending job could not be repaired into the Redis queue", getWarningDetails(jobId, context, error));
            return {
                mode: "redis",
                scheduled: false,
                error: getErrorMessage(error)
            };
        }
    }
    deps.startInlineJob(jobId);
    return {
        mode: "inline",
        scheduled: true
    };
}
async function repairPendingImageJobSchedules(jobs, context, deps, options = {}) {
    const limit = normalizeRepairLimit(options.limit);
    let attempted = 0;
    for (const job of jobs) {
        if (attempted >= limit)
            break;
        if (job.status !== "pending")
            continue;
        attempted += 1;
        await ensurePendingImageJobScheduled(job.id, context, deps);
    }
    return attempted;
}
async function repairPendingBatchItemSchedules(items, context, deps, options = {}) {
    const limit = normalizeRepairLimit(options.limit);
    const seenJobIds = new Set();
    let attempted = 0;
    for (const item of items) {
        if (attempted >= limit)
            break;
        const jobId = item.jobId?.trim();
        if (item.status !== "pending" || !jobId || seenJobIds.has(jobId))
            continue;
        seenJobIds.add(jobId);
        attempted += 1;
        await ensurePendingImageJobScheduled(jobId, context, deps);
    }
    return attempted;
}
