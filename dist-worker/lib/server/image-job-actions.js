"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pauseImageJobForUserWithDeps = pauseImageJobForUserWithDeps;
exports.resumeImageJobForUserWithDeps = resumeImageJobForUserWithDeps;
exports.forceKillImageJobForUserWithDeps = forceKillImageJobForUserWithDeps;
exports.retryImageJobForUserWithDeps = retryImageJobForUserWithDeps;
const image_job_state_1 = require("../image-job-state");
const errors_1 = require("./errors");
const FORCE_KILLED_JOB_ERROR = "Task was force killed from job monitor.";
async function pauseImageJobForUserWithDeps(userId, jobId, deps) {
    const job = await deps.imageJobClient.findFirst({
        where: {
            id: jobId,
            userId
        }
    });
    if (!job) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (!(0, image_job_state_1.isPausableImageJobStatus)(job.status)) {
        throw new errors_1.AppError("Only pending jobs can be paused.", 409);
    }
    const updated = await deps.imageJobClient.updateMany({
        where: {
            id: job.id,
            status: "pending"
        },
        data: {
            status: "paused",
            error: null,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            startedAt: null,
            finishedAt: null
        }
    });
    if (updated.count === 0) {
        throw new errors_1.AppError("Only pending jobs can be paused.", 409);
    }
    await deps.markBatchItemPaused(job.userId, job.batchId, job.batchItemId);
    if (deps.isImageQueueEnabled()) {
        try {
            await deps.removeQueuedImageJob(job.id);
        }
        catch (error) {
            console.warn("[images/jobs] queued job could not be removed during pause", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const paused = await deps.imageJobClient.findUnique({ where: { id: job.id } });
    return deps.toJobResponse(paused ?? { ...job, status: "paused" });
}
async function resumeImageJobForUserWithDeps(userId, jobId, deps) {
    const job = await deps.imageJobClient.findFirst({
        where: {
            id: jobId,
            userId
        }
    });
    if (!job) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (!(0, image_job_state_1.isResumableImageJobStatus)(job.status)) {
        throw new errors_1.AppError("Only paused jobs can be resumed.", 409);
    }
    const updated = await deps.imageJobClient.updateMany({
        where: {
            id: job.id,
            status: "paused"
        },
        data: {
            status: "pending",
            error: null,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            startedAt: null,
            finishedAt: null
        }
    });
    if (updated.count === 0) {
        throw new errors_1.AppError("Only paused jobs can be resumed.", 409);
    }
    if (job.batchId && job.batchItemId) {
        await deps.attachJobToBatchItem(job.userId, job.batchId, job.batchItemId, job.id);
    }
    try {
        if (deps.isImageQueueEnabled()) {
            await deps.enqueueImageJob(job.id);
        }
        else {
            deps.startImageJob(job.id);
        }
    }
    catch (error) {
        const message = deps.getImageQueueErrorMessage(error);
        await deps.imageJobClient.updateMany({
            where: {
                id: job.id,
                status: "pending"
            },
            data: {
                status: "paused",
                error: message,
                lockedBy: null,
                lockedAt: null,
                heartbeatAt: null,
                startedAt: null,
                finishedAt: null
            }
        });
        await deps.markBatchItemPaused(job.userId, job.batchId, job.batchItemId, message);
        throw new errors_1.AppError(message, 503);
    }
    const resumed = await deps.imageJobClient.findUnique({ where: { id: job.id } });
    return deps.toJobResponse(resumed ?? { ...job, status: "pending", error: null });
}
async function forceKillImageJobForUserWithDeps(userId, jobId, deps) {
    const job = await deps.imageJobClient.findFirst({
        where: {
            id: jobId,
            userId
        }
    });
    if (!job) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (!(0, image_job_state_1.isForceKillableImageJobStatus)(job.status)) {
        throw new errors_1.AppError("Only unfinished jobs can be force killed.", 409);
    }
    const finishedAt = new Date();
    const updated = await deps.imageJobClient.updateMany({
        where: {
            id: job.id,
            userId,
            status: { in: ["pending", "running", "paused"] }
        },
        data: {
            status: "failed",
            error: FORCE_KILLED_JOB_ERROR,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            finishedAt,
            executionMs: job.startedAt ? Math.max(0, finishedAt.getTime() - job.startedAt.getTime()) : undefined
        }
    });
    if (updated.count === 0) {
        const latest = await deps.imageJobClient.findUnique({ where: { id: job.id } });
        if (latest)
            return deps.toJobResponse(latest);
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (deps.isImageQueueEnabled() && job.status === "pending") {
        try {
            await deps.removeQueuedImageJob(job.id);
        }
        catch (error) {
            console.warn("[images/jobs] queued job could not be removed during force kill", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }
    await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, FORCE_KILLED_JOB_ERROR);
    await deps.refundJobPlatformQuota(job);
    const killed = await deps.imageJobClient.findUnique({ where: { id: job.id } });
    return deps.toJobResponse(killed ?? {
        ...job,
        status: "failed",
        error: FORCE_KILLED_JOB_ERROR,
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        finishedAt,
        executionMs: job.startedAt ? Math.max(0, finishedAt.getTime() - job.startedAt.getTime()) : job.executionMs,
        updatedAt: finishedAt
    });
}
async function retryImageJobForUserWithDeps(userId, jobId, deps) {
    const previousJob = await deps.imageJobClient.findFirst({
        where: {
            id: jobId,
            userId
        }
    });
    if (!previousJob) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (previousJob.batchId || previousJob.batchItemId) {
        throw new errors_1.AppError("Retry this job from its batch.", 400);
    }
    if (!(0, image_job_state_1.isRetryableImageJobStatus)(previousJob.status)) {
        throw new errors_1.AppError("Only failed jobs can be retried.", 400);
    }
    let requestJson = previousJob.requestJson;
    let platformQuotaDate;
    try {
        const parsed = JSON.parse(previousJob.requestJson);
        if (typeof parsed.platformQuotaDate === "string") {
            platformQuotaDate = await deps.reservePlatformQuota(userId);
            parsed.platformQuotaDate = platformQuotaDate;
            requestJson = JSON.stringify(parsed);
        }
    }
    catch {
        throw new errors_1.AppError("Previous job payload is invalid.", 500);
    }
    let job;
    try {
        job = await deps.imageJobClient.create({
            data: {
                userId,
                status: "pending",
                provider: previousJob.provider,
                model: previousJob.model,
                mode: previousJob.mode,
                prompt: previousJob.prompt,
                requestJson
            }
        });
    }
    catch (error) {
        await deps.refundPlatformQuota(userId, platformQuotaDate);
        throw error;
    }
    return {
        jobId: job.id,
        status: "pending"
    };
}
