"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryableImageJobError = void 0;
exports.runImageJobWithDeps = runImageJobWithDeps;
const node_crypto_1 = require("node:crypto");
const models_1 = require("../models");
const image_job_runner_1 = require("../image-job-runner");
const errors_1 = require("./errors");
const files_1 = require("./files");
const history_1 = require("./history");
const image_job_input_1 = require("./image-job-input");
const provider_config_1 = require("./provider-config");
const providers_1 = require("./providers");
const IMAGE_JOB_HEARTBEAT_INTERVAL_MS = 15 * 1000;
class RetryableImageJobError extends Error {
    constructor(message) {
        super(message);
        this.name = "RetryableImageJobError";
    }
}
exports.RetryableImageJobError = RetryableImageJobError;
function unrefTimer(timer) {
    timer.unref?.();
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
                ? "4K 鐢熷浘璇锋眰鍦ㄤ笂娓哥綉鍏宠秴鏃躲€傝鍏堟敼鐢?2K锛屾垨纭浣犵殑 OpenAI-compatible 缃戝叧鏀寔 4096px 杈撳嚭骞舵彁楂樿鍙栬秴鏃舵椂闂淬€?"
                : "涓婃父鐢熷浘缃戝叧瓒呮椂锛屾病鏈夎繑鍥炲浘鐗囥€傝绋嶅悗閲嶈瘯锛屾垨鍒囨崲鏇村揩鐨勪緵搴斿晢/妯″瀷銆侀檷浣庡鏉傚害銆傚鏋滆繖鏄綘鑷繁鐨勭綉鍏筹紝璇锋彁楂樼綉鍏宠鍙栬秴鏃舵椂闂淬€?",
            status: 504,
            kind: "upstream-timeout"
        };
    }
    if (upstreamStatus && upstreamStatus >= 500) {
        return {
            message: highResolution
                ? "4K 鐢熷浘璇锋眰琚笂娓哥綉鍏虫嫆缁濇垨澶勭悊澶辫触銆傝鍏堜娇鐢?2K锛屾垨纭浣犵殑 OpenAI-compatible 缃戝叧鏀寔 4096px 杈撳嚭銆?"
                : "涓婃父鐢熷浘鏈嶅姟鏆傛椂涓嶅彲鐢紝璇风◢鍚庨噸璇曟垨鍒囨崲渚涘簲鍟嗐€?",
            status: 502,
            kind: "upstream"
        };
    }
    if (/<html[\s>]|openresty|nginx/i.test(message)) {
        return {
            message: highResolution
                ? "4K 鐢熷浘璇锋眰娌℃湁杩斿洖鏈夋晥鍥剧墖銆傝鍏堜娇鐢?2K锛屾垨妫€鏌ョ涓夋柟 Base URL銆佹ā鍨?ID 鍜?4096px 杈撳嚭鏀寔銆?"
                : "涓婃父鏈嶅姟杩斿洖浜嗛潪鍥剧墖鍝嶅簲锛岀敓鎴愬け璐ャ€傝妫€鏌ョ涓夋柟 Base URL銆佹ā鍨?ID 鎴栫◢鍚庨噸璇曘€?",
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
function startHeartbeat(jobId, deps) {
    const timer = setInterval(() => {
        void deps.imageJobClient.updateMany({
            where: {
                id: jobId,
                status: "running",
                lockedBy: deps.workerId
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
async function isImageJobStillOwnedByThisWorker(jobId, deps) {
    const latest = await deps.imageJobClient.findUnique({ where: { id: jobId } });
    return Boolean(latest && !(0, image_job_runner_1.shouldIgnoreImageJobProviderResult)(latest, deps.workerId));
}
async function releaseImageJobForRetry(job, message, deps) {
    await deps.imageJobClient.updateMany({
        where: {
            id: job.id,
            status: "running",
            lockedBy: deps.workerId
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
        await deps.attachJobToBatchItem(job.userId, job.batchId, job.batchItemId, job.id);
    }
}
async function runImageJobWithDeps(job, options = {}, deps) {
    const stopHeartbeat = startHeartbeat(job.id, deps);
    const startedAt = Date.now();
    let upstreamMs;
    let fileSaveMs;
    let logContext = {
        provider: (0, models_1.isProviderId)(job.provider) ? job.provider : undefined,
        model: job.model
    };
    try {
        const input = (0, image_job_input_1.parseJobRequest)(job.requestJson);
        await deps.markBatchItemRunning(job.userId, job.batchId, job.batchItemId);
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
        const model = (0, image_job_input_1.resolveModelForJob)(input) ?? (0, image_job_input_1.validateModelRequest)(input.provider, input.modelId, input.mode, resolvedProvider);
        if (!(0, models_1.modelSupports)(model, input.mode)) {
            throw new errors_1.AppError("This model does not support that mode.");
        }
        const allowCustomSize = input.provider === "openai" && (0, image_job_input_1.isOpenAiCompatibleGateway)(resolvedProvider);
        if (input.provider === "openai" && !allowCustomSize) {
            (0, image_job_input_1.assertOfficialOpenAiSize)(input.size);
        }
        (0, image_job_input_1.assertModelOptions)(model, { ...input, allowCustomSize });
        const provider = (0, providers_1.getProvider)(input.provider);
        const inputImages = await (0, image_job_input_1.loadInputImages)(job.userId, input.sourceImageIds, input.uploadImageIds);
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
        if (!(await isImageJobStillOwnedByThisWorker(job.id, deps))) {
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
        if (!(await isImageJobStillOwnedByThisWorker(job.id, deps))) {
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
        await deps.markBatchItemSucceeded(job.userId, job.batchId, job.batchItemId, resultId);
        const finishedAt = new Date();
        await deps.imageJobClient.updateMany({
            where: {
                id: job.id,
                status: "running",
                lockedBy: deps.workerId
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
            await releaseImageJobForRetry(job, normalized.message, deps);
            throw new RetryableImageJobError(normalized.message);
        }
        const failed = await deps.imageJobClient.updateMany({
            where: {
                id: job.id,
                status: "running",
                lockedBy: deps.workerId
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
            await deps.markBatchItemFailed(job.userId, job.batchId, job.batchItemId, normalized.message);
            await deps.refundJobPlatformQuota(job);
        }
    }
    finally {
        stopHeartbeat();
    }
}
