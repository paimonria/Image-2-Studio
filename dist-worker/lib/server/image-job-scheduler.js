"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageQueueErrorMessage = getImageQueueErrorMessage;
exports.scheduleImageJobWithDeps = scheduleImageJobWithDeps;
exports.ensurePendingImageJobScheduledWithScheduler = ensurePendingImageJobScheduledWithScheduler;
exports.repairPendingImageJobsForReadWithDeps = repairPendingImageJobsForReadWithDeps;
exports.readImageBatchForUserWithPendingRepairWithDeps = readImageBatchForUserWithPendingRepairWithDeps;
exports.restorePendingImageJobsToQueueWithDeps = restorePendingImageJobsToQueueWithDeps;
const image_job_scheduling_1 = require("../image-job-scheduling");
const errors_1 = require("./errors");
function getPendingImageJobScheduleDeps(deps) {
    return {
        isRedisQueueEnabled: deps.isImageQueueEnabled,
        enqueueRedisJob: deps.enqueueImageJob,
        startInlineJob: deps.startImageJob,
        warn: (message, details) => console.warn(message, details)
    };
}
function getImageQueueErrorMessage(error) {
    const cause = error instanceof Error ? error.message : String(error || "unknown error");
    return `Image job queue is not reachable. Check REDIS_URL authentication and connectivity. Cause: ${cause}`;
}
async function scheduleImageJobWithDeps(jobId, deps) {
    if (deps.isImageQueueEnabled()) {
        try {
            await deps.enqueueImageJob(jobId);
            return;
        }
        catch (error) {
            await failPendingImageJobForQueueError(jobId, error, deps);
            throw new errors_1.AppError(getImageQueueErrorMessage(error), 503);
        }
    }
    deps.startImageJob(jobId);
}
async function ensurePendingImageJobScheduledWithScheduler(jobId, context, deps) {
    return (0, image_job_scheduling_1.ensurePendingImageJobScheduled)(jobId, context, getPendingImageJobScheduleDeps(deps));
}
async function repairPendingImageJobsForReadWithDeps(jobs, context, deps, limit = image_job_scheduling_1.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT) {
    return (0, image_job_scheduling_1.repairPendingImageJobSchedules)(jobs, context, getPendingImageJobScheduleDeps(deps), { limit });
}
async function readImageBatchForUserWithPendingRepairWithDeps(userId, batchId, deps) {
    const batch = await deps.readImageBatchForUser(userId, batchId);
    await (0, image_job_scheduling_1.repairPendingBatchItemSchedules)(batch.items, { source: "batch-detail", batchId }, getPendingImageJobScheduleDeps(deps));
    return batch;
}
async function restorePendingImageJobsToQueueWithDeps(limit, deps) {
    if (!deps.isImageQueueEnabled())
        return 0;
    await deps.assertImageQueueConnectionReady();
    const jobs = await deps.imageJobClient.findMany({
        where: {
            status: "pending"
        },
        orderBy: {
            createdAt: "asc"
        },
        take: Math.min(Math.max(limit, 1), 1000)
    });
    let restored = 0;
    for (const job of jobs) {
        await deps.enqueueImageJob(job.id);
        restored += 1;
    }
    return restored;
}
async function failPendingImageJobForQueueError(jobId, error, deps) {
    const job = await deps.imageJobClient.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "pending")
        return;
    const finishedAt = new Date();
    const message = getImageQueueErrorMessage(error);
    const updated = await deps.imageJobClient.updateMany({
        where: {
            id: job.id,
            status: "pending"
        },
        data: {
            status: "failed",
            error: message,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            finishedAt
        }
    });
    if (updated.count === 0)
        return;
    await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, message);
    await deps.refundJobPlatformQuota(job);
}
