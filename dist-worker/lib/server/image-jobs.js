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
const models_1 = require("../models");
const errors_1 = require("./errors");
const files_1 = require("./files");
const history_1 = require("./history");
const db_1 = require("./db");
const providers_1 = require("./providers");
const provider_config_1 = require("./provider-config");
const usage_1 = require("./usage");
const image_queue_1 = require("./image-queue");
const batches_1 = require("./batches");
const image_job_state_1 = require("../image-job-state");
const image_job_runner_1 = require("../image-job-runner");
const job_monitor_1 = require("../job-monitor");
const batch_start_1 = require("../batch-start");
const image_job_scheduling_1 = require("../image-job-scheduling");
const MAX_PROMPT_LENGTH = 2000;
const MAX_REFERENCE_IMAGES = 4;
const RUNNING_JOB_TIMEOUT_MS = 30 * 60 * 1000;
const STALE_JOB_ERROR = "Image generation was interrupted before completion. Please start a new request.";
const FORCE_KILLED_JOB_ERROR = "Task was force killed from job monitor.";
const DEFAULT_IMAGE_JOB_CONCURRENCY = 2;
const MAX_IMAGE_JOB_CONCURRENCY = 8;
const DEFAULT_IMAGE_JOB_SCHEDULER_INTERVAL_MS = 5000;
const IMAGE_JOB_HEARTBEAT_INTERVAL_MS = 15 * 1000;
const IMAGE_JOB_STALE_SWEEP_INTERVAL_MS = 30 * 1000;
const IMAGE_JOB_CLAIM_SCAN_LIMIT = 50;
const IMAGE_JOB_RECENT_STATS_MS = 60 * 60 * 1000;
const IMAGE_JOB_WORKER_ID = `${process.env.HOSTNAME ?? "local"}:${process.pid}:${(0, node_crypto_1.randomUUID)()}`;
class RetryableImageJobError extends Error {
    constructor(message) {
        super(message);
        this.name = "RetryableImageJobError";
    }
}
exports.RetryableImageJobError = RetryableImageJobError;
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
function getErrorStatus(error) {
    if (!error || typeof error !== "object")
        return undefined;
    const status = error.status;
    if (typeof status === "number")
        return status;
    const code = error.code;
    if (typeof code === "number")
        return code;
    return undefined;
}
function getUpstreamErrorDetails(error) {
    if (!error || typeof error !== "object")
        return undefined;
    const source = error;
    return {
        code: typeof source.code === "string" ? source.code : undefined,
        type: typeof source.type === "string" ? source.type : undefined,
        param: typeof source.param === "string" ? source.param : undefined,
        requestId: typeof source.request_id === "string" ? source.request_id : undefined,
        body: source.error && typeof source.error === "object" ? source.error : undefined
    };
}
function getBaseUrlHost(baseUrl) {
    if (!baseUrl)
        return "default";
    try {
        return new URL(baseUrl).host;
    }
    catch {
        return "invalid";
    }
}
function isUpstreamTimeout(status, message) {
    return status === 408
        || status === 504
        || status === 524
        || /524|504|gateway time-out|gateway timeout|proxy read timeout|read timeout|timed out|timeout|took too long to respond/i.test(message);
}
function isHighResolutionRequest(context) {
    return context?.resolution === "4096" || /(^|x)4096(x|$)/.test(context?.size ?? "");
}
function normalizeCreateError(error, context) {
    if (error instanceof errors_1.AppError) {
        return {
            message: error.message,
            status: error.status,
            kind: "app"
        };
    }
    const rawMessage = error instanceof Error ? error.message : String(error || "");
    const upstreamStatus = getErrorStatus(error);
    const message = rawMessage.replace(/\s+/g, " ").trim();
    const highResolution = isHighResolutionRequest(context);
    if (isUpstreamTimeout(upstreamStatus, message)) {
        return {
            message: highResolution
                ? "4K 生图请求在上游网关超时。请先改用 2K，或确认你的 OpenAI-compatible 网关支持 4096px 输出并提高读取超时时间。"
                : "上游生图网关超时，没有返回图片。请稍后重试，或切换更快的供应商/模型、降低复杂度。如果这是你自己的网关，请提高网关读取超时时间。",
            status: 504,
            kind: "upstream-timeout"
        };
    }
    if (upstreamStatus && upstreamStatus >= 500) {
        return {
            message: highResolution
                ? "4K 生图请求被上游网关拒绝或处理失败。请先使用 2K，或确认你的 OpenAI-compatible 网关支持 4096px 输出。"
                : "上游生图服务暂时不可用，请稍后重试或切换供应商。",
            status: 502,
            kind: "upstream"
        };
    }
    if (/<html[\s>]|openresty|nginx/i.test(message)) {
        return {
            message: highResolution
                ? "4K 生图请求没有返回有效图片。请先使用 2K，或检查第三方 Base URL、模型 ID 和 4096px 输出支持。"
                : "上游服务返回了非图片响应，生成失败。请检查第三方 Base URL、模型 ID 或稍后重试。",
            status: 502,
            kind: "upstream"
        };
    }
    return {
        message: message || "Generation failed.",
        status: upstreamStatus && upstreamStatus >= 400 ? upstreamStatus : 500,
        kind: "upstream"
    };
}
function isRetryableCreateError(normalized) {
    return normalized.kind === "upstream-timeout"
        || normalized.status === 408
        || normalized.status === 409
        || normalized.status === 425
        || normalized.status === 429
        || normalized.status >= 500;
}
function getString(formData, key) {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
}
function getOptionalString(formData, key) {
    const value = getString(formData, key);
    return value || undefined;
}
function getStringList(formData, key) {
    return formData
        .getAll(key)
        .flatMap((value) => {
        if (typeof value !== "string")
            return [];
        const trimmed = value.trim();
        if (!trimmed)
            return [];
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
            }
            catch {
                return [];
            }
        }
        return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    });
}
function getFiles(formData) {
    return formData
        .getAll("files")
        .filter((value) => value instanceof File && value.size > 0);
}
function isAllowedOption(value, allowed) {
    return !value || !allowed || allowed.includes(value);
}
const OPENAI_OFFICIAL_IMAGE_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);
function mapAspectRatioToOfficialOpenAiSize(aspectRatio) {
    if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1")
        return "1024x1024";
    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    if (!rawWidth || !rawHeight)
        return "1024x1024";
    if (rawWidth > rawHeight)
        return "1536x1024";
    if (rawHeight > rawWidth)
        return "1024x1536";
    return "1024x1024";
}
function mapAspectRatioToResolutionSize(aspectRatio, resolution) {
    const longEdge = Number.parseInt(resolution ?? "", 10);
    const safeLongEdge = Number.isFinite(longEdge) && longEdge > 0 ? longEdge : 1024;
    if (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1")
        return `${safeLongEdge}x${safeLongEdge}`;
    const [rawWidth, rawHeight] = aspectRatio.split(":").map(Number);
    if (!rawWidth || !rawHeight)
        return `${safeLongEdge}x${safeLongEdge}`;
    if (rawWidth >= rawHeight) {
        return `${safeLongEdge}x${Math.round((safeLongEdge * rawHeight) / rawWidth)}`;
    }
    return `${Math.round((safeLongEdge * rawWidth) / rawHeight)}x${safeLongEdge}`;
}
function resolveImageRequestSize(provider, resolvedProvider, aspectRatio, resolution, requestedSize) {
    if (provider !== "openai")
        return requestedSize;
    if (isOpenAiCompatibleGateway(resolvedProvider)) {
        return resolution ? mapAspectRatioToResolutionSize(aspectRatio, resolution) : requestedSize;
    }
    if (!resolution || resolution === "1024")
        return mapAspectRatioToOfficialOpenAiSize(aspectRatio);
    return mapAspectRatioToResolutionSize(aspectRatio, resolution);
}
function isOpenAiCompatibleGateway(resolvedProvider) {
    return Boolean(resolvedProvider.baseUrl);
}
function assertOfficialOpenAiSize(size) {
    if (!size || OPENAI_OFFICIAL_IMAGE_SIZES.has(size))
        return;
    throw new errors_1.AppError("Official OpenAI image generation does not support this resolution. Configure an OpenAI-compatible Base URL for 2K/4K output, or choose 1K.", 400);
}
function assertModelOptions(model, input) {
    if (!input.allowCustomSize && !isAllowedOption(input.size, model.supportedSizes)) {
        throw new errors_1.AppError("This model does not support that size.");
    }
    if (!isAllowedOption(input.aspectRatio, model.supportedAspectRatios)) {
        throw new errors_1.AppError("This model does not support that aspect ratio.");
    }
    if (!isAllowedOption(input.quality, model.qualityOptions)) {
        throw new errors_1.AppError("This model does not support that quality setting.");
    }
    if (!isAllowedOption(input.inputFidelity, model.inputFidelityOptions)) {
        throw new errors_1.AppError("This model does not support that input fidelity.");
    }
}
function validateModelRequest(provider, modelId, mode, resolvedProvider) {
    const model = (0, models_1.getModel)(provider, modelId)
        ?? (provider === "openai" && resolvedProvider.model && resolvedProvider.model === modelId
            ? (0, models_1.createOpenAICompatibleModel)(resolvedProvider.model)
            : undefined);
    if (!model) {
        throw new errors_1.AppError("Unknown provider or model.");
    }
    if (!(0, models_1.modelSupports)(model, mode)) {
        throw new errors_1.AppError("This model does not support that mode.");
    }
    return model;
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
function parseJobRequest(job) {
    let parsed;
    try {
        parsed = JSON.parse(job.requestJson);
    }
    catch {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    if (!parsed || typeof parsed !== "object") {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    const input = parsed;
    const provider = typeof input.provider === "string" ? input.provider : null;
    const mode = typeof input.mode === "string" ? input.mode : null;
    if (!(0, models_1.isProviderId)(provider) || !(0, models_1.isImageMode)(mode) || typeof input.modelId !== "string") {
        throw new errors_1.AppError("Image job payload is invalid.", 500);
    }
    return {
        provider,
        modelId: input.modelId,
        mode,
        prompt: typeof input.prompt === "string" ? input.prompt : "",
        size: typeof input.size === "string" ? input.size : undefined,
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
        resolution: typeof input.resolution === "string" ? input.resolution : undefined,
        quality: typeof input.quality === "string" ? input.quality : undefined,
        inputFidelity: typeof input.inputFidelity === "string" ? input.inputFidelity : undefined,
        sourceImageIds: Array.isArray(input.sourceImageIds) ? input.sourceImageIds.filter((item) => typeof item === "string") : [],
        uploadImageIds: Array.isArray(input.uploadImageIds) ? input.uploadImageIds.filter((item) => typeof item === "string") : [],
        customModel: Boolean(input.customModel),
        platformQuotaDate: typeof input.platformQuotaDate === "string" ? input.platformQuotaDate : undefined
    };
}
function resolveModelForJob(input) {
    const catalogModel = (0, models_1.getModel)(input.provider, input.modelId);
    if (catalogModel)
        return catalogModel;
    if (input.customModel && input.provider === "openai") {
        return (0, models_1.createOpenAICompatibleModel)(input.modelId);
    }
    return undefined;
}
async function loadInputImages(userId, sourceImageIds, uploadImageIds) {
    const sourceInputs = await Promise.all(sourceImageIds.map((id) => (0, files_1.readStoredImageForUser)(userId, id)));
    const uploadedInputs = await Promise.all(uploadImageIds.map((id) => (0, files_1.readStoredImageForUser)(userId, id)));
    return [...sourceInputs, ...uploadedInputs].map((file) => ({
        filename: file.filename,
        mimeType: file.mimeType,
        buffer: file.buffer,
        publicUrl: file.imageUrl
    }));
}
async function assertSourceImagesExist(userId, sourceImageIds) {
    if (sourceImageIds.length === 0)
        return;
    const records = await (0, history_1.findRecordsByIds)(userId, sourceImageIds);
    const foundIds = new Set(records.map((record) => record.id));
    const missing = sourceImageIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new errors_1.AppError("Could not find the selected source image.");
    }
}
function getBatchStartPromptErrorMessage(error) {
    if (error === "too-many")
        return `Use ${batch_start_1.BATCH_START_MAX_PROMPTS} prompts or fewer.`;
    if (error === "too-long")
        return `Each prompt must be ${batch_start_1.BATCH_START_MAX_PROMPT_LENGTH} characters or fewer.`;
    return "Enter at least one prompt.";
}
async function resolveImageJobFormInput(userId, formData, prompt) {
    const providerValue = getString(formData, "provider");
    const modelId = getString(formData, "model");
    const modeValue = getString(formData, "mode");
    if (!(0, models_1.isProviderId)(providerValue)) {
        throw new errors_1.AppError("Choose a valid provider.");
    }
    if (!(0, models_1.isImageMode)(modeValue)) {
        throw new errors_1.AppError("Choose a valid generation mode.");
    }
    if (!prompt) {
        throw new errors_1.AppError("Enter a prompt.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
        throw new errors_1.AppError(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    }
    const resolvedProvider = await (0, provider_config_1.getResolvedProviderConfig)(userId, providerValue);
    if (!resolvedProvider.apiKey) {
        throw new errors_1.AppError("This provider has no API key configured.", 503);
    }
    const model = validateModelRequest(providerValue, modelId, modeValue, resolvedProvider);
    const aspectRatio = getOptionalString(formData, "aspectRatio") ?? model.defaultAspectRatio;
    const resolution = getOptionalString(formData, "resolution");
    const requestedSize = getOptionalString(formData, "size")
        ?? mapAspectRatioToResolutionSize(aspectRatio, resolution)
        ?? model.defaultSize;
    const size = resolveImageRequestSize(providerValue, resolvedProvider, aspectRatio, resolution, requestedSize);
    const quality = getOptionalString(formData, "quality") ?? model.defaultQuality;
    const inputFidelity = getOptionalString(formData, "inputFidelity") ?? model.inputFidelityOptions?.[0];
    const allowCustomSize = providerValue === "openai" && isOpenAiCompatibleGateway(resolvedProvider);
    if (providerValue === "openai" && !allowCustomSize) {
        assertOfficialOpenAiSize(size);
    }
    assertModelOptions(model, { size, aspectRatio, quality, inputFidelity, allowCustomSize });
    const files = getFiles(formData);
    const sourceImageIds = getStringList(formData, "sourceImageIds");
    for (const file of files) {
        (0, files_1.assertAllowedImageFile)(file);
    }
    if (files.length + sourceImageIds.length > MAX_REFERENCE_IMAGES) {
        throw new errors_1.AppError(`Use at most ${MAX_REFERENCE_IMAGES} reference images.`);
    }
    if (modeValue === "image-to-image" && files.length + sourceImageIds.length === 0) {
        throw new errors_1.AppError("Image-to-image needs an upload or a history image.");
    }
    await assertSourceImagesExist(userId, sourceImageIds);
    return {
        provider: providerValue,
        model,
        mode: modeValue,
        prompt,
        size,
        aspectRatio,
        resolution,
        quality,
        inputFidelity,
        sourceImageIds,
        files,
        resolvedProvider
    };
}
function buildImageJobRequest(input, prompt, uploadImageIds, platformQuotaDate) {
    return {
        provider: input.provider,
        modelId: input.model.modelId,
        mode: input.mode,
        prompt,
        size: input.size,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        quality: input.quality,
        inputFidelity: input.inputFidelity,
        sourceImageIds: input.sourceImageIds,
        uploadImageIds,
        customModel: !(0, models_1.getModel)(input.provider, input.model.modelId),
        platformQuotaDate
    };
}
async function refundJobPlatformQuota(job) {
    let input;
    try {
        input = parseJobRequest(job);
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
function startHeartbeat(jobId) {
    const timer = setInterval(() => {
        void imageJobClient().updateMany({
            where: {
                id: jobId,
                status: "running",
                lockedBy: IMAGE_JOB_WORKER_ID
            },
            data: {
                heartbeatAt: new Date()
            }
        }).catch((error) => {
            console.warn("[images/jobs] heartbeat failed", {
                jobId,
                cause: error instanceof Error ? error.message : String(error)
            });
        });
    }, IMAGE_JOB_HEARTBEAT_INTERVAL_MS);
    unrefTimer(timer);
    return () => clearInterval(timer);
}
async function isImageJobStillOwnedByThisWorker(jobId) {
    const latest = await imageJobClient().findUnique({ where: { id: jobId } });
    return Boolean(latest && !(0, image_job_runner_1.shouldIgnoreImageJobProviderResult)(latest, IMAGE_JOB_WORKER_ID));
}
async function createImageJobFromFormData(userId, formData) {
    const prompt = getString(formData, "prompt");
    const batchId = getOptionalString(formData, "batchId");
    const batchItemId = getOptionalString(formData, "batchItemId");
    if ((batchId && !batchItemId) || (!batchId && batchItemId)) {
        throw new errors_1.AppError("Batch metadata is incomplete.");
    }
    if (batchId && batchItemId) {
        await (0, batches_1.markBatchItemCreating)(userId, batchId, batchItemId);
    }
    const input = await resolveImageJobFormInput(userId, formData, prompt);
    const jobs = imageJobClient();
    const platformQuotaDate = input.resolvedProvider.source !== "user"
        ? await (0, usage_1.reservePlatformQuota)(userId)
        : undefined;
    try {
        const uploadedFiles = await Promise.all(input.files.map((file) => (0, files_1.saveUploadedFile)(userId, file)));
        const jobRequest = buildImageJobRequest(input, input.prompt, uploadedFiles.map((file) => file.id), platformQuotaDate);
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
        throw new errors_1.AppError(getBatchStartPromptErrorMessage(parsedPrompts.error), parsedPrompts.error === "empty" ? 400 : 413);
    }
    const prompts = parsedPrompts.prompts;
    const input = await resolveImageJobFormInput(userId, formData, prompts[0]);
    const name = getOptionalString(formData, "name")?.slice(0, 80) ?? `Batch ${new Date().toLocaleString("sv-SE")}`;
    const promptFormat = getString(formData, "promptFormat") === "lines" ? "lines" : "blocks";
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
                const jobRequest = buildImageJobRequest(input, prompt, uploadImageIds, platformQuotaDates[itemIndex]);
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
async function scheduleImageJob(jobId) {
    if ((0, image_queue_1.isImageQueueEnabled)()) {
        try {
            await (0, image_queue_1.enqueueImageJob)(jobId);
            return;
        }
        catch (error) {
            await failPendingImageJobForQueueError(jobId, error);
            throw new errors_1.AppError(getImageQueueErrorMessage(error), 503);
        }
    }
    startImageJob(jobId);
}
function getImageQueueErrorMessage(error) {
    const cause = error instanceof Error ? error.message : String(error || "unknown error");
    return `Image job queue is not reachable. Check REDIS_URL authentication and connectivity. Cause: ${cause}`;
}
function getPendingImageJobScheduleDeps() {
    return {
        isRedisQueueEnabled: image_queue_1.isImageQueueEnabled,
        enqueueRedisJob: image_queue_1.enqueueImageJob,
        startInlineJob: startImageJob,
        warn: (message, details) => console.warn(message, details)
    };
}
async function ensurePendingImageJobScheduled(jobId, context) {
    return (0, image_job_scheduling_1.ensurePendingImageJobScheduled)(jobId, context, getPendingImageJobScheduleDeps());
}
async function repairPendingImageJobsForRead(jobs, context, limit = image_job_scheduling_1.DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT) {
    return (0, image_job_scheduling_1.repairPendingImageJobSchedules)(jobs, context, getPendingImageJobScheduleDeps(), { limit });
}
async function readImageBatchForUserWithPendingRepair(userId, batchId) {
    const batch = await (0, batches_1.readImageBatchForUser)(userId, batchId);
    await (0, image_job_scheduling_1.repairPendingBatchItemSchedules)(batch.items, { source: "batch-detail", batchId }, getPendingImageJobScheduleDeps());
    return batch;
}
async function failPendingImageJobForQueueError(jobId, error) {
    const job = await imageJobClient().findUnique({ where: { id: jobId } });
    if (!job || job.status !== "pending")
        return;
    const finishedAt = new Date();
    const message = getImageQueueErrorMessage(error);
    const updated = await imageJobClient().updateMany({
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
    await (0, batches_1.markBatchItemFailed)(job.userId, job.batchId, job.batchItemId, message);
    await refundJobPlatformQuota(job);
}
async function pauseImageJobForUser(userId, jobId) {
    const job = await imageJobClient().findFirst({
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
    const updated = await imageJobClient().updateMany({
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
    await (0, batches_1.markBatchItemPaused)(job.userId, job.batchId, job.batchItemId);
    if ((0, image_queue_1.isImageQueueEnabled)()) {
        try {
            await (0, image_queue_1.removeQueuedImageJob)(job.id);
        }
        catch (error) {
            console.warn("[images/jobs] queued job could not be removed during pause", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }
    const paused = await imageJobClient().findUnique({ where: { id: job.id } });
    return toJobResponse(paused ?? { ...job, status: "paused" });
}
async function resumeImageJobForUser(userId, jobId) {
    const job = await imageJobClient().findFirst({
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
    const updated = await imageJobClient().updateMany({
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
        await (0, batches_1.attachJobToBatchItem)(job.userId, job.batchId, job.batchItemId, job.id);
    }
    try {
        if ((0, image_queue_1.isImageQueueEnabled)()) {
            await (0, image_queue_1.enqueueImageJob)(job.id);
        }
        else {
            startImageJob(job.id);
        }
    }
    catch (error) {
        const message = getImageQueueErrorMessage(error);
        await imageJobClient().updateMany({
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
        await (0, batches_1.markBatchItemPaused)(job.userId, job.batchId, job.batchItemId, message);
        throw new errors_1.AppError(message, 503);
    }
    const resumed = await imageJobClient().findUnique({ where: { id: job.id } });
    return toJobResponse(resumed ?? { ...job, status: "pending", error: null });
}
async function forceKillImageJobForUser(userId, jobId) {
    const job = await imageJobClient().findFirst({
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
    const updated = await imageJobClient().updateMany({
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
        const latest = await imageJobClient().findUnique({ where: { id: job.id } });
        if (latest)
            return toJobResponse(latest);
        throw new errors_1.AppError("Image job not found.", 404);
    }
    if ((0, image_queue_1.isImageQueueEnabled)() && job.status === "pending") {
        try {
            await (0, image_queue_1.removeQueuedImageJob)(job.id);
        }
        catch (error) {
            console.warn("[images/jobs] queued job could not be removed during force kill", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }
    await (0, batches_1.markBatchItemFailed)(job.userId, job.batchId, job.batchItemId, FORCE_KILLED_JOB_ERROR);
    await refundJobPlatformQuota(job);
    const killed = await imageJobClient().findUnique({ where: { id: job.id } });
    return toJobResponse(killed ?? {
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
async function restorePendingImageJobsToQueue(limit = 100) {
    if (!(0, image_queue_1.isImageQueueEnabled)())
        return 0;
    await (0, image_queue_1.assertImageQueueConnectionReady)();
    const jobs = await imageJobClient().findMany({
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
        await (0, image_queue_1.enqueueImageJob)(job.id);
        restored += 1;
    }
    return restored;
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
                void runImageJob(claimedJob)
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
        await runImageJob(claimedJob, options);
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
function averageNullable(values) {
    const numericValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (numericValues.length === 0)
        return null;
    return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
}
function getFailureRate(failed, total) {
    if (total <= 0)
        return 0;
    return Math.round((failed / total) * 100);
}
function getProviderHealthStatus(total, failed) {
    if (total === 0)
        return "idle";
    const failureRate = failed / total;
    if (total >= 3 && failureRate >= 0.5)
        return "failing";
    if (failed > 0 || failureRate >= 0.2)
        return "degraded";
    return "healthy";
}
function getFailureReason(error) {
    const message = (error ?? "").toLowerCase();
    if (/api key|apikey|unauthorized|auth|401|permission|forbidden|invalid key/.test(message)) {
        return "API key / auth";
    }
    if (/quota|rate limit|429|billing|credit|insufficient|too many requests/.test(message)) {
        return "Quota / rate limit";
    }
    if (/timeout|timed out|time-out|gateway timeout|gateway time-out|504|524|read timeout/.test(message)) {
        return "Timeout";
    }
    if (/network|fetch failed|econn|socket|dns|connection|connect/.test(message)) {
        return "Network";
    }
    if (/prompt|parameter|param|invalid|unsupported|size|resolution|reference|file|image-to-image/.test(message)) {
        return "Invalid request";
    }
    if (/interrupted|stale|worker|scheduler|heartbeat/.test(message)) {
        return "Interrupted job";
    }
    if (/provider|upstream|service unavailable|openai|nginx|openresty|502|503|500/.test(message)) {
        return "Provider error";
    }
    return "Other";
}
function getFailureSample(error) {
    const normalized = (error ?? "No error message").replace(/\s+/g, " ").trim();
    return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}
function getRecentDiagnostics(recentJobs) {
    const providerMap = new Map();
    const modelMap = new Map();
    const failureMap = new Map();
    for (const job of recentJobs) {
        const providerJobs = providerMap.get(job.provider) ?? [];
        providerJobs.push(job);
        providerMap.set(job.provider, providerJobs);
        const modelKey = `${job.provider}:${job.model}`;
        const modelJobs = modelMap.get(modelKey) ?? [];
        modelJobs.push(job);
        modelMap.set(modelKey, modelJobs);
        if (job.status === "failed") {
            const reason = getFailureReason(job.error);
            const current = failureMap.get(reason);
            const latestAt = job.updatedAt ?? job.finishedAt ?? job.createdAt;
            if (current) {
                current.count += 1;
                if (latestAt > current.latestAt) {
                    current.sample = getFailureSample(job.error);
                    current.latestAt = latestAt;
                }
            }
            else {
                failureMap.set(reason, {
                    count: 1,
                    sample: getFailureSample(job.error),
                    latestAt
                });
            }
        }
    }
    const providerHealth = Array.from(providerMap.entries())
        .map(([provider, jobs]) => {
        const succeeded = jobs.filter((job) => job.status === "succeeded").length;
        const failed = jobs.filter((job) => job.status === "failed").length;
        return {
            provider,
            status: getProviderHealthStatus(jobs.length, failed),
            total: jobs.length,
            succeeded,
            failed,
            failureRate: getFailureRate(failed, jobs.length),
            averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs)),
            averageUpstreamMs: averageNullable(jobs.map((job) => job.upstreamMs))
        };
    })
        .sort((left, right) => right.total - left.total || right.failed - left.failed);
    const modelUsage = Array.from(modelMap.entries())
        .map(([key, jobs]) => {
        const [provider, ...modelParts] = key.split(":");
        const model = modelParts.join(":");
        const succeeded = jobs.filter((job) => job.status === "succeeded").length;
        const failed = jobs.filter((job) => job.status === "failed").length;
        return {
            provider,
            model,
            total: jobs.length,
            succeeded,
            failed,
            averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs))
        };
    })
        .sort((left, right) => right.total - left.total || right.failed - left.failed)
        .slice(0, 8);
    const failureReasons = Array.from(failureMap.entries())
        .map(([reason, item]) => ({
        reason,
        count: item.count,
        sample: item.sample,
        latestAt: item.latestAt.toISOString()
    }))
        .sort((left, right) => right.count - left.count || right.latestAt.localeCompare(left.latestAt))
        .slice(0, 8);
    return {
        providerHealth,
        modelUsage,
        failureReasons
    };
}
async function getImageJobQueueSnapshot() {
    ensureInlineImageJobScheduler();
    const recentCutoff = new Date(Date.now() - IMAGE_JOB_RECENT_STATS_MS);
    const [pending, running, recentFailed, recentSucceeded, recentJobs] = await Promise.all([
        imageJobClient().count({ where: { status: "pending" } }),
        imageJobClient().count({ where: { status: "running" } }),
        imageJobClient().count({ where: { status: "failed", updatedAt: { gte: recentCutoff } } }),
        imageJobClient().count({ where: { status: "succeeded", updatedAt: { gte: recentCutoff } } }),
        imageJobClient().findMany({
            where: {
                status: {
                    in: ["succeeded", "failed"]
                },
                updatedAt: {
                    gte: recentCutoff
                }
            },
            orderBy: {
                updatedAt: "desc"
            },
            take: 200
        })
    ]);
    const concurrency = getImageJobConcurrency();
    const diagnostics = getRecentDiagnostics(recentJobs);
    const redisEnabled = (0, image_queue_1.isImageQueueEnabled)();
    const queue = await (0, image_queue_1.checkImageQueueConnection)();
    const bullmq = redisEnabled && queue.ok
        ? await (0, image_queue_1.getImageQueueJobCounts)().catch((error) => {
            console.warn("[images/jobs] redis queue counts could not be read", {
                cause: error instanceof Error ? error.message : String(error)
            });
            return {
                waiting: 0,
                active: 0,
                delayed: 0,
                failed: 0,
                completed: 0
            };
        })
        : {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0
        };
    return {
        workerId: IMAGE_JOB_WORKER_ID,
        backend: redisEnabled ? "redis" : "inline",
        queue,
        bullmq,
        concurrency: redisEnabled ? (0, image_queue_1.getImageWorkerConcurrency)() : concurrency,
        userConcurrency: redisEnabled ? (0, image_queue_1.getImageWorkerConcurrency)() : getImageJobUserConcurrency(concurrency),
        active: activeJobIds.size,
        queued: pending,
        pending,
        running,
        recentFailed,
        recentSucceeded,
        recent: {
            inspected: recentJobs.length,
            averageQueueWaitMs: averageNullable(recentJobs.map((job) => job.queueWaitMs)),
            averageExecutionMs: averageNullable(recentJobs.map((job) => job.executionMs)),
            averageUpstreamMs: averageNullable(recentJobs.map((job) => job.upstreamMs)),
            averageFileSaveMs: averageNullable(recentJobs.map((job) => job.fileSaveMs))
        },
        ...diagnostics
    };
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
    const previousJob = await imageJobClient().findFirst({
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
            platformQuotaDate = await (0, usage_1.reservePlatformQuota)(userId);
            parsed.platformQuotaDate = platformQuotaDate;
            requestJson = JSON.stringify(parsed);
        }
    }
    catch {
        throw new errors_1.AppError("Previous job payload is invalid.", 500);
    }
    let job;
    try {
        job = await imageJobClient().create({
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
        await (0, usage_1.refundPlatformQuota)(userId, platformQuotaDate);
        throw error;
    }
    return {
        jobId: job.id,
        status: "pending"
    };
}
async function releaseImageJobForRetry(job, message) {
    await imageJobClient().updateMany({
        where: {
            id: job.id,
            status: "running",
            lockedBy: IMAGE_JOB_WORKER_ID
        },
        data: {
            status: "pending",
            error: message,
            lockedBy: null,
            lockedAt: null,
            heartbeatAt: null,
            startedAt: null,
            finishedAt: null
        }
    });
    if (job.batchId && job.batchItemId) {
        await (0, batches_1.attachJobToBatchItem)(job.userId, job.batchId, job.batchItemId, job.id);
    }
}
async function runImageJob(job, options = {}) {
    const stopHeartbeat = startHeartbeat(job.id);
    const startedAt = Date.now();
    let upstreamMs;
    let fileSaveMs;
    let logContext = {
        provider: (0, models_1.isProviderId)(job.provider) ? job.provider : undefined,
        model: job.model
    };
    try {
        const input = parseJobRequest(job);
        await (0, batches_1.markBatchItemRunning)(job.userId, job.batchId, job.batchItemId);
        const resolvedProvider = await (0, provider_config_1.getResolvedProviderConfig)(job.userId, input.provider);
        if (!resolvedProvider.apiKey) {
            throw new errors_1.AppError("This provider has no API key configured.", 503);
        }
        logContext = {
            provider: input.provider,
            model: input.modelId,
            providerConfigSource: resolvedProvider.source,
            baseUrlHost: getBaseUrlHost(resolvedProvider.baseUrl),
            mode: input.mode,
            size: input.size,
            aspectRatio: input.aspectRatio,
            resolution: input.resolution,
            quality: input.quality,
            referenceImageCount: input.sourceImageIds.length + input.uploadImageIds.length
        };
        const model = resolveModelForJob(input) ?? validateModelRequest(input.provider, input.modelId, input.mode, resolvedProvider);
        if (!(0, models_1.modelSupports)(model, input.mode)) {
            throw new errors_1.AppError("This model does not support that mode.");
        }
        const allowCustomSize = input.provider === "openai" && isOpenAiCompatibleGateway(resolvedProvider);
        if (input.provider === "openai" && !allowCustomSize) {
            assertOfficialOpenAiSize(input.size);
        }
        assertModelOptions(model, { ...input, allowCustomSize });
        const provider = (0, providers_1.getProvider)(input.provider);
        const inputImages = await loadInputImages(job.userId, input.sourceImageIds, input.uploadImageIds);
        const upstreamStartedAt = Date.now();
        const result = await provider.createImage({
            credentials: {
                apiKey: resolvedProvider.apiKey,
                baseUrl: resolvedProvider.baseUrl
            },
            model,
            mode: input.mode,
            prompt: input.prompt,
            size: input.size,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            inputFidelity: input.inputFidelity,
            inputImages
        });
        upstreamMs = Date.now() - upstreamStartedAt;
        if (!(await isImageJobStillOwnedByThisWorker(job.id))) {
            console.warn("[images/jobs] ignoring late provider result", {
                jobId: job.id,
                elapsedMs: Date.now() - startedAt
            });
            return;
        }
        const fileSaveStartedAt = Date.now();
        const generated = await (0, files_1.saveGeneratedImage)(job.userId, result.imageBuffer, result.mimeType);
        fileSaveMs = Date.now() - fileSaveStartedAt;
        const resultId = (0, node_crypto_1.randomUUID)();
        if (!(await isImageJobStillOwnedByThisWorker(job.id))) {
            console.warn("[images/jobs] ignoring late provider result after file save", {
                jobId: job.id,
                elapsedMs: Date.now() - startedAt
            });
            return;
        }
        await (0, history_1.appendHistory)({
            id: resultId,
            userId: job.userId,
            provider: input.provider,
            model: model.modelId,
            mode: input.mode,
            prompt: input.prompt,
            filePath: generated.filePath,
            mimeType: generated.mimeType,
            size: input.size,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            inputFidelity: input.provider === "openai" ? input.inputFidelity : undefined,
            sourceImageIds: input.sourceImageIds,
            uploadImageIds: input.uploadImageIds,
            parentId: input.sourceImageIds.length === 1 ? input.sourceImageIds[0] : undefined,
            batchId: job.batchId ?? undefined,
            batchItemId: job.batchItemId ?? undefined,
            providerMeta: result.providerMeta
        });
        await (0, batches_1.markBatchItemSucceeded)(job.userId, job.batchId, job.batchItemId, resultId);
        const finishedAt = new Date();
        await imageJobClient().updateMany({
            where: {
                id: job.id,
                status: "running",
                lockedBy: IMAGE_JOB_WORKER_ID
            },
            data: {
                status: "succeeded",
                resultId,
                error: null,
                lockedBy: null,
                lockedAt: null,
                heartbeatAt: null,
                finishedAt,
                executionMs: finishedAt.getTime() - startedAt,
                upstreamMs,
                fileSaveMs
            }
        });
    }
    catch (error) {
        const normalized = normalizeCreateError(error, {
            size: logContext.size,
            resolution: logContext.resolution
        });
        const finishedAt = new Date();
        const logPayload = {
            jobId: job.id,
            status: normalized.status,
            elapsedMs: finishedAt.getTime() - startedAt,
            upstreamMs,
            fileSaveMs,
            ...logContext,
            message: normalized.message,
            cause: error instanceof Error ? error.message : String(error),
            upstreamError: getUpstreamErrorDetails(error)
        };
        if (normalized.kind === "upstream-timeout") {
            console.warn("[images/jobs] upstream timeout", logPayload);
        }
        else {
            console.error("[images/jobs] generation failed", logPayload);
        }
        if (options.retryable && isRetryableCreateError(normalized)) {
            await releaseImageJobForRetry(job, normalized.message);
            throw new RetryableImageJobError(normalized.message);
        }
        const failed = await imageJobClient().updateMany({
            where: {
                id: job.id,
                status: "running",
                lockedBy: IMAGE_JOB_WORKER_ID
            },
            data: {
                status: "failed",
                error: normalized.message,
                lockedBy: null,
                lockedAt: null,
                heartbeatAt: null,
                finishedAt,
                executionMs: finishedAt.getTime() - startedAt,
                upstreamMs,
                fileSaveMs
            }
        });
        if (failed.count > 0) {
            await (0, batches_1.markBatchItemFailed)(job.userId, job.batchId, job.batchItemId, normalized.message);
            await refundJobPlatformQuota(job);
        }
    }
    finally {
        stopHeartbeat();
    }
}
