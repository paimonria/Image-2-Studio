"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryableImageJobError = void 0;
exports.createImageJobFromFormData = createImageJobFromFormData;
exports.createAndScheduleImageBatchFromFormData = createAndScheduleImageBatchFromFormData;
exports.scheduleImageJob = scheduleImageJob;
exports.readImageBatchForUserWithPendingRepair = readImageBatchForUserWithPendingRepair;
exports.pauseImageJobForUser = pauseImageJobForUser;
exports.resumeImageJobForUser = resumeImageJobForUser;
exports.forceKillImageJobForUser = forceKillImageJobForUser;
exports.restorePendingImageJobsToQueue = restorePendingImageJobsToQueue;
exports.startImageJob = startImageJob;
exports.runClaimedImageJobById = runClaimedImageJobById;
exports.getImageJobQueueSnapshot = getImageJobQueueSnapshot;
exports.getImageJobForUser = getImageJobForUser;
exports.listImageJobsForUser = listImageJobsForUser;
exports.retryImageJobForUser = retryImageJobForUser;
const node_crypto_1 = require("node:crypto");
const errors_1 = require("./errors");
const files_1 = require("./files");
const db_1 = require("./db");
const usage_1 = require("./usage");
const image_queue_1 = require("./image-queue");
const batches_1 = require("./batches");
const job_monitor_1 = require("../job-monitor");
const batch_start_1 = require("../batch-start");
const image_job_diagnostics_1 = require("./image-job-diagnostics");
const image_job_actions_1 = require("./image-job-actions");
const image_job_scheduler_1 = require("./image-job-scheduler");
const image_job_input_1 = require("./image-job-input");
const image_job_runner_1 = require("./image-job-runner");
var image_job_runner_2 = require("./image-job-runner");
Object.defineProperty(exports, "RetryableImageJobError", { enumerable: true, get: function () { return image_job_runner_2.RetryableImageJobError; } });
const RUNNING_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_JOB_ERROR = "Image generation was interrupted before completion. Please start a new request.";
const DEFAULT_IMAGE_JOB_CONCURRENCY = 2;
const MAX_IMAGE_JOB_CONCURRENCY = 8;
const DEFAULT_IMAGE_JOB_SCHEDULER_INTERVAL_MS = 5000;
const IMAGE_JOB_STALE_SWEEP_INTERVAL_MS = 30 * 1000;
const IMAGE_JOB_CLAIM_SCAN_LIMIT = 50;
const IMAGE_JOB_RECENT_STATS_MS = 60 * 60 * 1000;
const IMAGE_JOB_WORKER_ID = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${(0, node_crypto_1.randomUUID)()}`;
const activeJobIds = new Set();
const activeUserJobCounts = new Map();
let drainingImageJobs = false;
let schedulerStarted = false;
let lastStaleSweepAt = 0;
function getImageJobConcurrency() {
    const parsed = Number.parseInt(process.env.IMAGE_JOB_CONCURRENCY ?? "", 10);
    if (!Number.isFinite(parsed))
        return DEFAULT_IMAGE_JOB_CONCURRENCY;
    return Math.min(Math.max(parsed, 1), MAX_IMAGE_JOB_CONCURRENCY);
}
function getImageJobUserConcurrency(globalConcurrency = getImageJobConcurrency()) {
    const parsed = Number.parseInt(process.env.IMAGE_JOB_USER_CONCURRENCY ?? "", 10);
    const defaultLimit = Math.max(1, Math.ceil(globalConcurrency / 2));
    if (!Number.isFinite(parsed))
        return defaultLimit;
    return Math.min(Math.max(parsed, 1), globalConcurrency);
}
function isInlineImageJobWorkerEnabled() {
    return !(0, image_queue_1.isImageQueueEnabled)();
}
function ensureInlineImageJobScheduler() {
    if (!isInlineImageJobWorkerEnabled())
        return;
    ensureImageJobScheduler();
}
function getActiveUserJobCount(userId) {
    return activeUserJobCounts.get(userId) ?? 0;
}
function markJobActive(job) {
    activeJobIds.add(job.id);
    activeUserJobCounts.set(job.userId, getActiveUserJobCount(job.userId) + 1);
}
function markJobInactive(job) {
    activeJobIds.delete(job.id);
    const nextCount = getActiveUserJobCount(job.userId) - 1;
    if (nextCount <= 0) {
        activeUserJobCounts.delete(job.userId);
    }
    else {
        activeUserJobCounts.set(job.userId, nextCount);
    }
}
function unrefTimer(timer) {
    timer.unref?.();
}
function imageJobClient() {
    const client = db_1.prisma.imageJob;
    if (!client) {
        throw new errors_1.AppError("Image job database client is not ready. Please rebuild the image so Prisma Client is regenerated.", 503);
    }
    return client;
}
function resolveStoredJobStatus(status) {
    if (status === "paused" || status === "running" || status === "succeeded" || status === "failed")
        return status;
    return "pending";
}
function toJobResponse(job) {
    const status = resolveStoredJobStatus(job.status);
    return {
        id: job.id,
        status,
        provider: job.provider,
        model: job.model,
        mode: job.mode,
        prompt: job.prompt,
        batchId: job.batchId ?? undefined,
        batchItemId: job.batchItemId ?? undefined,
        resultId: job.resultId ?? undefined,
        imageUrl: status === "succeeded" && job.resultId ? `/api/images/file/${job.resultId}` : undefined,
        error: job.error ?? undefined,
        queueWaitMs: job.queueWaitMs ?? undefined,
        executionMs: job.executionMs ?? undefined,
        upstreamMs: job.upstreamMs ?? undefined,
        fileSaveMs: job.fileSaveMs ?? undefined,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString(),
        finishedAt: job.finishedAt?.toISOString()
    };
}
async function refundJobPlatformQuota(job) {
    let input;
    try {
        input = (0, image_job_input_1.parseJobRequest)(job.requestJson);
    }
    catch (error) {
        console.warn("[images/jobs] could not parse job payload for quota refund", {
            jobId: job.id,
            cause: error instanceof Error ? error.message : String(error)
        });
        return;
    }
    await (0, usage_1.refundPlatformQuota)(job.userId, input.platformQuotaDate);
}
function isStaleRunningJob(job) {
    const lastHeartbeatAt = job.heartbeatAt ?? job.lockedAt ?? job.startedAt;
    return job.status === "running"
        && Boolean(lastHeartbeatAt)
        && !activeJobIds.has(job.id)
        && Date.now() - lastHeartbeatAt.getTime() > RUNNING_JOB_TIMEOUT_MS;
}
async function failStaleRunningJob(job) {
    const failedAt = new Date();
    const failed = await imageJobClient().updateMany({
        where: {
            id: job.id,
            status: "running"
        },
        data: {
            status: "failed",
            error: STALE_JOB_ERROR,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            finishedAt: failedAt,
            executionMs: job.startedAt ? Math.max(0, failedAt.getTime() - job.startedAt.getTime()) : undefined
        }
    });
    if (failed.count === 0) {
        return null;
    }
    const failedJob = {
        ...job,
        status: "failed",
        error: STALE_JOB_ERROR,
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null,
        finishedAt: failedAt,
        executionMs: job.startedAt ? Math.max(0, failedAt.getTime() - job.startedAt.getTime()) : job.executionMs,
        updatedAt: failedAt
    };
    await refundJobPlatformQuota(failedJob);
    return failedJob;
}
async function sweepStaleRunningJobs() {
    const now = Date.now();
    if (now - lastStaleSweepAt < IMAGE_JOB_STALE_SWEEP_INTERVAL_MS)
        return;
    lastStaleSweepAt = now;
    let staleJobs;
    try {
        staleJobs = await imageJobClient().findMany({
            where: {
                status: "running"
            },
            orderBy: {
                startedAt: "asc"
            },
            take: IMAGE_JOB_CLAIM_SCAN_LIMIT
        });
    }
    catch (error) {
        console.warn("[images/jobs] stale sweep failed", {
            cause: error instanceof Error ? error.message : String(error)
        });
        return;
    }
    for (const job of staleJobs) {
        if (!isStaleRunningJob(job))
            continue;
        await failStaleRunningJob(job);
    }
}
async function getPendingClaimCandidates(limit, excludedUserIds = []) {
    return imageJobClient().findMany({
        where: {
            status: "pending",
            ...(excludedUserIds.length > 0 ? { userId: { notIn: excludedUserIds } } : {})
        },
        orderBy: {
            createdAt: "asc"
        },
        take: limit
    });
}
async function claimPendingImageJob(job) {
    const now = new Date();
    const claimed = await imageJobClient().updateMany({
        where: {
            id: job.id,
            status: "pending"
        },
        data: {
            status: "running",
            error: null,
            lockedBy: IMAGE_JOB_WORKER_ID,
            lockedAt: now,
            heartbeatAt: now,
            startedAt: now,
            finishedAt: null,
            queueWaitMs: Math.max(0, now.getTime() - job.createdAt.getTime())
        }
    });
    if (claimed.count === 0)
        return null;
    return imageJobClient().findUnique({ where: { id: job.id } });
}
async function createImageJobFromFormData(userId, formData) {
    const prompt = (0, image_job_input_1.getString)(formData, "prompt");
    const batchId = (0, image_job_input_1.getOptionalString)(formData, "batchId");
    const batchItemId = (0, image_job_input_1.getOptionalString)(formData, "batchItemId");
    if ((batchId && !batchItemId) || (!batchId && batchItemId)) {
        throw new errors_1.AppError("Batch metadata is incomplete.");
    }
    if (batchId && batchItemId) {
        await (0, batches_1.markBatchItemCreating)(userId, batchId, batchItemId);
    }
    const input = await (0, image_job_input_1.resolveImageJobFormInput)(userId, formData, prompt);
    const jobs = imageJobClient();
    const platformQuotaDate = input.resolvedProvider.source !== "user"
        ? await (0, usage_1.reservePlatformQuota)(userId)
        : undefined;
    try {
        const uploadedFiles = await Promise.all(input.files.map((file) => (0, files_1.saveUploadedFile)(userId, file)));
        const jobRequest = (0, image_job_input_1.buildImageJobRequest)(input, input.prompt, uploadedFiles.map((file) => file.id), platformQuotaDate);
        const job = await jobs.create({
            data: {
                userId,
                status: "pending",
                provider: input.provider,
                model: input.model.modelId,
                mode: input.mode,
                prompt,
                requestJson: JSON.stringify(jobRequest),
                batchId,
                batchItemId
            }
        });
        if (batchId && batchItemId) {
            await (0, batches_1.attachJobToBatchItem)(userId, batchId, batchItemId, job.id);
        }
        return {
            jobId: job.id,
            status: "pending"
        };
    }
    catch (error) {
        await (0, usage_1.refundPlatformQuota)(userId, platformQuotaDate);
        const message = error instanceof Error ? error.message : String(error);
        if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
            throw new errors_1.AppError("Image job table is not ready. Please run database migrations before generating images.", 503);
        }
        if (batchId && batchItemId) {
            await (0, batches_1.markBatchItemFailed)(userId, batchId, batchItemId, error);
        }
        throw error;
    }
}
async function createAndScheduleImageBatchFromFormData(userId, formData) {
    const parsedPrompts = (0, batch_start_1.parseBatchStartPrompts)(formData.getAll("prompts"));
    if (parsedPrompts.error) {
        throw new errors_1.AppError((0, image_job_input_1.getBatchStartPromptErrorMessage)(parsedPrompts.error), parsedPrompts.error === "empty" ? 400 : 413);
    }
    const prompts = parsedPrompts.prompts;
    const input = await (0, image_job_input_1.resolveImageJobFormInput)(userId, formData, prompts[0]);
    const name = (0, image_job_input_1.getOptionalString)(formData, "name")?.slice(0, 80) ?? `Batch ${new Date().toLocaleString("sv-SE")}`;
    const promptFormat = (0, image_job_input_1.getString)(formData, "promptFormat") === "lines" ? "lines" : "blocks";
    const platformQuotaDates = [];
    let batchId = "";
    const jobIds = [];
    try {
        if (input.resolvedProvider.source !== "user") {
            for (let index = 0; index < prompts.length; index += 1) {
                platformQuotaDates[index] = await (0, usage_1.reservePlatformQuota)(userId);
            }
        }
        const uploadedFiles = await Promise.all(input.files.map((file) => (0, files_1.saveUploadedFile)(userId, file)));
        const uploadImageIds = uploadedFiles.map((file) => file.id);
        await db_1.prisma.$transaction(async (tx) => {
            const batch = await tx.imageBatch.create({
                data: {
                    userId,
                    name,
                    provider: input.provider,
                    model: input.model.modelId,
                    mode: input.mode,
                    totalCount: prompts.length,
                    promptFormat
                }
            });
            batchId = batch.id;
            for (let itemIndex = 0; itemIndex < prompts.length; itemIndex += 1) {
                const prompt = prompts[itemIndex];
                const item = await tx.imageBatchItem.create({
                    data: {
                        batchId: batch.id,
                        userId,
                        itemIndex,
                        provider: input.provider,
                        model: input.model.modelId,
                        mode: input.mode,
                        prompt,
                        status: "pending"
                    }
                });
                const jobRequest = (0, image_job_input_1.buildImageJobRequest)(input, prompt, uploadImageIds, platformQuotaDates[itemIndex]);
                const job = await tx.imageJob.create({
                    data: {
                        userId,
                        status: "pending",
                        provider: input.provider,
                        model: input.model.modelId,
                        mode: input.mode,
                        prompt,
                        requestJson: JSON.stringify(jobRequest),
                        batchId: batch.id,
                        batchItemId: item.id
                    }
                });
                jobIds.push(job.id);
                await tx.imageBatchItem.update({
                    where: { id: item.id },
                    data: {
                        jobId: job.id,
                        status: "pending"
                    }
                });
            }
        });
    }
    catch (error) {
        await Promise.all(platformQuotaDates.map((date) => (0, usage_1.refundPlatformQuota)(userId, date)));
        throw error;
    }
    const scheduleResults = await Promise.allSettled(jobIds.map((jobId) => scheduleImageJob(jobId)));
    const failedSchedules = scheduleResults.filter((result) => result.status === "rejected");
    if (failedSchedules.length > 0) {
        console.warn("[images/jobs] batch jobs could not all be scheduled", {
            batchId,
            failed: failedSchedules.length
        });
    }
    return (0, batches_1.readImageBatchForUser)(userId, batchId);
}
function getImageJobSchedulerDeps() {
    return {
        imageJobClient: imageJobClient(),
        isImageQueueEnabled: image_queue_1.isImageQueueEnabled,
        enqueueImageJob: image_queue_1.enqueueImageJob,
        startImageJob,
        assertImageQueueConnectionReady: image_queue_1.assertImageQueueConnectionReady,
        markBatchItemFailed: batches_1.markBatchItemFailed,
        refundJobPlatformQuota,
        readImageBatchForUser: batches_1.readImageBatchForUser
    };
}
async function scheduleImageJob(jobId) {
    return (0, image_job_scheduler_1.scheduleImageJobWithDeps)(jobId, getImageJobSchedulerDeps());
}
async function ensurePendingImageJobScheduled(jobId, context) {
    return (0, image_job_scheduler_1.ensurePendingImageJobScheduledWithScheduler)(jobId, context, getImageJobSchedulerDeps());
}
async function repairPendingImageJobsForRead(jobs, context, limit) {
    return (0, image_job_scheduler_1.repairPendingImageJobsForReadWithDeps)(jobs, context, getImageJobSchedulerDeps(), limit);
}
async function readImageBatchForUserWithPendingRepair(userId, batchId) {
    return (0, image_job_scheduler_1.readImageBatchForUserWithPendingRepairWithDeps)(userId, batchId, getImageJobSchedulerDeps());
}
function getImageJobActionDeps() {
    return {
        imageJobClient: imageJobClient(),
        toJobResponse,
        isImageQueueEnabled: image_queue_1.isImageQueueEnabled,
        enqueueImageJob: image_queue_1.enqueueImageJob,
        removeQueuedImageJob: image_queue_1.removeQueuedImageJob,
        startImageJob,
        getImageQueueErrorMessage: image_job_scheduler_1.getImageQueueErrorMessage,
        markBatchItemPaused: batches_1.markBatchItemPaused,
        markBatchItemFailed: batches_1.markBatchItemFailed,
        attachJobToBatchItem: batches_1.attachJobToBatchItem,
        reservePlatformQuota: usage_1.reservePlatformQuota,
        refundPlatformQuota: usage_1.refundPlatformQuota,
        refundJobPlatformQuota
    };
}
function getImageJobRunnerDeps() {
    return {
        workerId: IMAGE_JOB_WORKER_ID,
        imageJobClient: imageJobClient(),
        markBatchItemRunning: batches_1.markBatchItemRunning,
        markBatchItemSucceeded: batches_1.markBatchItemSucceeded,
        markBatchItemFailed: batches_1.markBatchItemFailed,
        attachJobToBatchItem: batches_1.attachJobToBatchItem,
        refundJobPlatformQuota
    };
}
async function pauseImageJobForUser(userId, jobId) {
    return (0, image_job_actions_1.pauseImageJobForUserWithDeps)(userId, jobId, getImageJobActionDeps());
}
async function resumeImageJobForUser(userId, jobId) {
    return (0, image_job_actions_1.resumeImageJobForUserWithDeps)(userId, jobId, getImageJobActionDeps());
}
async function forceKillImageJobForUser(userId, jobId) {
    return (0, image_job_actions_1.forceKillImageJobForUserWithDeps)(userId, jobId, getImageJobActionDeps());
}
async function restorePendingImageJobsToQueue(limit = 100) {
    return (0, image_job_scheduler_1.restorePendingImageJobsToQueueWithDeps)(limit, getImageJobSchedulerDeps());
}
function startImageJob(_jobId) {
    if (!isInlineImageJobWorkerEnabled())
        return;
    ensureImageJobScheduler();
    void drainImageJobQueue();
}
function ensureImageJobScheduler() {
    if (schedulerStarted)
        return;
    schedulerStarted = true;
    const timer = setInterval(() => {
        void drainImageJobQueue();
    }, DEFAULT_IMAGE_JOB_SCHEDULER_INTERVAL_MS);
    unrefTimer(timer);
}
async function getRunningJobCountForUser(userId) {
    return imageJobClient().count({
        where: {
            userId,
            status: "running"
        }
    });
}
async function drainImageJobQueue() {
    if (drainingImageJobs)
        return;
    drainingImageJobs = true;
    try {
        await sweepStaleRunningJobs();
        const concurrency = getImageJobConcurrency();
        const userConcurrency = getImageJobUserConcurrency(concurrency);
        const runningByUser = new Map();
        const blockedUserIds = new Set();
        while (activeJobIds.size < concurrency) {
            const candidates = await getPendingClaimCandidates(IMAGE_JOB_CLAIM_SCAN_LIMIT, [...blockedUserIds]);
            if (candidates.length === 0)
                break;
            let launched = false;
            for (const candidate of candidates) {
                if (activeJobIds.size >= concurrency)
                    break;
                if (activeJobIds.has(candidate.id))
                    continue;
                let runningForUser = runningByUser.get(candidate.userId);
                if (runningForUser === undefined) {
                    runningForUser = Math.max(getActiveUserJobCount(candidate.userId), await getRunningJobCountForUser(candidate.userId));
                    runningByUser.set(candidate.userId, runningForUser);
                }
                if (runningForUser >= userConcurrency) {
                    blockedUserIds.add(candidate.userId);
                    continue;
                }
                const claimedJob = await claimPendingImageJob(candidate);
                if (!claimedJob)
                    continue;
                launched = true;
                runningByUser.set(candidate.userId, runningForUser + 1);
                markJobActive(claimedJob);
                void (0, image_job_runner_1.runImageJobWithDeps)(claimedJob, {}, getImageJobRunnerDeps())
                    .catch((error) => {
                    console.error("[images/jobs] runner crashed", {
                        jobId: claimedJob.id,
                        cause: error instanceof Error ? error.message : String(error)
                    });
                })
                    .finally(() => {
                    markJobInactive(claimedJob);
                    void drainImageJobQueue();
                });
            }
            if (!launched)
                break;
        }
    }
    finally {
        drainingImageJobs = false;
    }
}
async function runClaimedImageJobById(jobId, options = {}) {
    const job = await imageJobClient().findUnique({ where: { id: jobId } });
    if (!job) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (job.status === "paused")
        return toJobResponse(job);
    if (job.status === "succeeded")
        return toJobResponse(job);
    if (job.status === "failed")
        return toJobResponse(job);
    const claimedJob = job.status === "running" && job.lockedBy === IMAGE_JOB_WORKER_ID
        ? job
        : await claimPendingImageJob(job);
    if (!claimedJob) {
        const latest = await imageJobClient().findUnique({ where: { id: jobId } });
        if (latest)
            return toJobResponse(latest);
        throw new errors_1.AppError("Image job not found.", 404);
    }
    markJobActive(claimedJob);
    try {
        await (0, image_job_runner_1.runImageJobWithDeps)(claimedJob, options, getImageJobRunnerDeps());
    }
    finally {
        markJobInactive(claimedJob);
    }
    const finished = await imageJobClient().findUnique({ where: { id: jobId } });
    if (!finished) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    return toJobResponse(finished);
}
async function getImageJobQueueSnapshot() {
    return (0, image_job_diagnostics_1.getImageJobQueueSnapshotFromDeps)({
        workerId: IMAGE_JOB_WORKER_ID,
        activeCount: activeJobIds.size,
        recentStatsMs: IMAGE_JOB_RECENT_STATS_MS,
        imageJobClient: imageJobClient(),
        ensureInlineImageJobScheduler,
        isRedisQueueEnabled: image_queue_1.isImageQueueEnabled,
        checkImageQueueConnection: image_queue_1.checkImageQueueConnection,
        getImageQueueJobCounts: image_queue_1.getImageQueueJobCounts,
        getInlineConcurrency: getImageJobConcurrency,
        getInlineUserConcurrency: getImageJobUserConcurrency,
        getRedisWorkerConcurrency: image_queue_1.getImageWorkerConcurrency
    });
}
async function getImageJobForUser(userId, jobId) {
    let job;
    try {
        job = await imageJobClient().findFirst({
            where: {
                id: jobId,
                userId
            }
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
            throw new errors_1.AppError("Image job table is not ready. Please run database migrations before checking image jobs.", 503);
        }
        throw error;
    }
    if (!job) {
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if (isStaleRunningJob(job)) {
        job = await failStaleRunningJob(job) ?? job;
    }
    if (job.status === "pending") {
        await ensurePendingImageJobScheduled(job.id, { source: "job-detail" });
    }
    return toJobResponse(job);
}
async function listImageJobsForUser(userId, input) {
    ensureInlineImageJobScheduler();
    await sweepStaleRunningJobs();
    const parsedLimit = Number.parseInt(input.limit ?? "", 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;
    const scope = input.scope === "active" || input.scope === "failed" || input.scope === "recent"
        ? input.scope
        : "recent";
    const statusFilter = scope === "active"
        ? { in: ["pending", "running"] }
        : scope === "failed"
            ? "failed"
            : undefined;
    let jobs;
    try {
        const monitorUser = await db_1.prisma.user.findUnique({
            where: { id: userId },
            select: { jobMonitorFinishedClearedAt: true }
        });
        const finishedClearedAt = scope === "active" ? null : monitorUser?.jobMonitorFinishedClearedAt ?? null;
        const finishedClearedFilter = scope === "failed"
            ? null
            : (0, job_monitor_1.buildFinishedJobVisibilityFilter)(finishedClearedAt);
        jobs = await imageJobClient().findMany({
            where: {
                userId,
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(scope === "failed" ? ((0, job_monitor_1.buildFinishedJobAfterClearFilter)(finishedClearedAt) ?? {}) : {}),
                ...(finishedClearedFilter ? { AND: [finishedClearedFilter] } : {})
            },
            orderBy: { createdAt: "desc" },
            take: limit
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/imageJob/i.test(message) || /no such table.*ImageJob/i.test(message) || /relation .*ImageJob.* does not exist/i.test(message)) {
            throw new errors_1.AppError("Image job table is not ready. Please run database migrations before listing image jobs.", 503);
        }
        throw error;
    }
    if (scope === "active") {
        await repairPendingImageJobsForRead(jobs, { source: "job-list-active" }, limit);
    }
    return {
        jobs: jobs.map(toJobResponse)
    };
}
async function retryImageJobForUser(userId, jobId) {
    return (0, image_job_actions_1.retryImageJobForUserWithDeps)(userId, jobId, getImageJobActionDeps());
}
