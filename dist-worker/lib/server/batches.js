"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateImageBatch = recalculateImageBatch;
exports.createImageBatchForUser = createImageBatchForUser;
exports.readImageBatchesForUser = readImageBatchesForUser;
exports.readImageBatchForUser = readImageBatchForUser;
exports.markBatchItemCreating = markBatchItemCreating;
exports.attachJobToBatchItem = attachJobToBatchItem;
exports.markBatchItemRunning = markBatchItemRunning;
exports.markBatchItemSucceeded = markBatchItemSucceeded;
exports.markBatchItemFailed = markBatchItemFailed;
exports.markBatchItemPaused = markBatchItemPaused;
exports.retryImageBatchItems = retryImageBatchItems;
const models_1 = require("../models");
const image_job_state_1 = require("../image-job-state");
const errors_1 = require("./errors");
const db_1 = require("./db");
const usage_1 = require("./usage");
const batch_timeouts_1 = require("./batch-timeouts");
const MAX_BATCH_PROMPTS = 20;
const MAX_PROMPT_LENGTH = 2000;
const DEFAULT_BATCH_LIMIT = 20;
const MAX_BATCH_LIMIT = 50;
function normalizeLimit(value) {
    if (!value)
        return DEFAULT_BATCH_LIMIT;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_BATCH_LIMIT;
    return Math.min(parsed, MAX_BATCH_LIMIT);
}
function resolveBatchStatus(items) {
    return (0, image_job_state_1.resolveImageBatchStatusFromItemStatuses)(items.map((item) => item.status));
}
function toBatchItemResponse(item) {
    return {
        id: item.id,
        batchId: item.batchId,
        index: item.itemIndex,
        provider: item.provider,
        model: item.model,
        mode: item.mode,
        prompt: item.prompt,
        status: item.status,
        jobId: item.jobId ?? undefined,
        resultId: item.resultId ?? undefined,
        imageUrl: item.resultId ? `/api/images/file/${item.resultId}` : undefined,
        error: item.error ?? undefined,
        retryCount: item.retryCount,
        createdAt: item.createdAt.toISOString(),
        startedAt: item.startedAt?.toISOString(),
        finishedAt: item.finishedAt?.toISOString()
    };
}
function toBatchResponse(batch, items) {
    const resolvedItems = items ?? [];
    const successCount = resolvedItems.length > 0
        ? resolvedItems.filter((item) => item.status === "succeeded").length
        : batch.successCount;
    const failedCount = resolvedItems.length > 0
        ? resolvedItems.filter((item) => item.status === "failed").length
        : batch.failedCount;
    return {
        id: batch.id,
        name: batch.name,
        provider: batch.provider,
        model: batch.model,
        mode: batch.mode,
        status: resolvedItems.length > 0 ? resolveBatchStatus(resolvedItems) : batch.status,
        totalCount: batch.totalCount,
        successCount,
        failedCount,
        promptFormat: batch.promptFormat,
        createdAt: batch.createdAt.toISOString(),
        updatedAt: batch.updatedAt.toISOString(),
        finishedAt: batch.finishedAt?.toISOString()
    };
}
function toBatchDetailResponse(batch) {
    return {
        ...toBatchResponse(batch, batch.items),
        items: batch.items.map(toBatchItemResponse)
    };
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error || "Batch item failed.");
}
async function readBatchWithItems(userId, batchId) {
    const batch = await db_1.prisma.imageBatch.findFirst({
        where: { id: batchId, userId },
        include: {
            items: {
                orderBy: { itemIndex: "asc" }
            }
        }
    });
    if (!batch) {
        throw new errors_1.AppError("Batch not found.", 404);
    }
    return batch;
}
async function recalculateImageBatch(batchId) {
    const batch = await db_1.prisma.imageBatch.findUnique({
        where: { id: batchId },
        include: { items: true }
    });
    if (!batch)
        return null;
    const items = batch.items;
    const successCount = items.filter((item) => item.status === "succeeded").length;
    const failedCount = items.filter((item) => item.status === "failed").length;
    const status = resolveBatchStatus(items);
    const finished = successCount + failedCount >= batch.totalCount;
    return db_1.prisma.imageBatch.update({
        where: { id: batchId },
        data: {
            status,
            successCount,
            failedCount,
            finishedAt: finished ? (batch.finishedAt ?? new Date()) : null
        }
    });
}
async function createImageBatchForUser(userId, input) {
    const provider = typeof input.provider === "string" ? input.provider : "";
    const mode = typeof input.mode === "string" ? input.mode : "";
    const model = typeof input.model === "string" ? input.model.trim() : "";
    const prompts = Array.isArray(input.prompts)
        ? input.prompts.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
        : [];
    if (!(0, models_1.isProviderId)(provider)) {
        throw new errors_1.AppError("Choose a valid provider.");
    }
    if (!(0, models_1.isImageMode)(mode)) {
        throw new errors_1.AppError("Choose a valid generation mode.");
    }
    if (!model) {
        throw new errors_1.AppError("Choose a model first.");
    }
    if (prompts.length === 0) {
        throw new errors_1.AppError("Enter at least one prompt.");
    }
    if (prompts.length > MAX_BATCH_PROMPTS) {
        throw new errors_1.AppError(`Use ${MAX_BATCH_PROMPTS} prompts or fewer.`);
    }
    if (prompts.some((prompt) => prompt.length > MAX_PROMPT_LENGTH)) {
        throw new errors_1.AppError(`Each prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`);
    }
    const name = typeof input.name === "string" && input.name.trim()
        ? input.name.trim().slice(0, 80)
        : `Batch ${new Date().toLocaleString("sv-SE")}`;
    const promptFormat = input.promptFormat === "lines" ? "lines" : "blocks";
    const batch = await db_1.prisma.$transaction(async (tx) => {
        const created = await tx.imageBatch.create({
            data: {
                userId,
                name,
                provider,
                model,
                mode,
                totalCount: prompts.length,
                promptFormat
            }
        });
        await tx.imageBatchItem.createMany({
            data: prompts.map((prompt, itemIndex) => ({
                batchId: created.id,
                userId,
                itemIndex,
                provider,
                model,
                mode,
                prompt
            }))
        });
        return tx.imageBatch.findUnique({
            where: { id: created.id },
            include: {
                items: {
                    orderBy: { itemIndex: "asc" }
                }
            }
        });
    });
    if (!batch) {
        throw new errors_1.AppError("Batch could not be created.", 500);
    }
    return toBatchDetailResponse(batch);
}
async function readImageBatchesForUser(userId, limitValue) {
    const batches = await db_1.prisma.imageBatch.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: normalizeLimit(limitValue)
    });
    return {
        batches: batches.map((batch) => toBatchResponse(batch))
    };
}
async function readImageBatchForUser(userId, batchId) {
    let batch = await readBatchWithItems(userId, batchId);
    if (await (0, batch_timeouts_1.expireImageBatchIfTimedOut)(userId, batch)) {
        batch = await readBatchWithItems(userId, batchId);
    }
    return toBatchDetailResponse(batch);
}
async function markBatchItemCreating(userId, batchId, itemId) {
    const updated = await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "creating",
            error: null,
            resultId: null,
            startedAt: null,
            finishedAt: null
        }
    });
    if (updated.count === 0) {
        throw new errors_1.AppError("Batch item not found.", 404);
    }
    await recalculateImageBatch(batchId);
}
async function attachJobToBatchItem(userId, batchId, itemId, jobId) {
    await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "pending",
            jobId,
            error: null,
            resultId: null,
            startedAt: null,
            finishedAt: null
        }
    });
    await recalculateImageBatch(batchId);
}
async function markBatchItemRunning(userId, batchId, itemId) {
    if (!batchId || !itemId)
        return;
    await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "running",
            error: null,
            startedAt: new Date(),
            finishedAt: null
        }
    });
    await recalculateImageBatch(batchId);
}
async function markBatchItemSucceeded(userId, batchId, itemId, resultId) {
    if (!batchId || !itemId)
        return;
    await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "succeeded",
            resultId,
            error: null,
            finishedAt: new Date()
        }
    });
    await recalculateImageBatch(batchId);
}
async function markBatchItemFailed(userId, batchId, itemId, error) {
    if (!batchId || !itemId)
        return;
    await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "failed",
            error: getErrorMessage(error),
            finishedAt: new Date()
        }
    });
    await recalculateImageBatch(batchId);
}
async function markBatchItemPaused(userId, batchId, itemId, error) {
    if (!batchId || !itemId)
        return;
    await db_1.prisma.imageBatchItem.updateMany({
        where: {
            id: itemId,
            batchId,
            userId
        },
        data: {
            status: "paused",
            error: error === undefined ? null : getErrorMessage(error),
            startedAt: null,
            finishedAt: null
        }
    });
    await recalculateImageBatch(batchId);
}
async function retryImageBatchItems(userId, batchId, itemIds) {
    const batch = await readBatchWithItems(userId, batchId);
    const requestedIds = Array.isArray(itemIds)
        ? new Set(itemIds.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))
        : null;
    const failedItems = batch.items.filter((item) => (0, image_job_state_1.isRetryableBatchItemStatus)(item.status) && (!requestedIds || requestedIds.has(item.id)));
    const jobIds = [];
    for (const item of failedItems) {
        if (!item.jobId) {
            await markBatchItemFailed(userId, batchId, item.id, "No previous job payload is available for retry.");
            continue;
        }
        const previousJob = await db_1.prisma.imageJob.findFirst({
            where: {
                id: item.jobId,
                userId
            }
        });
        if (!previousJob) {
            await markBatchItemFailed(userId, batchId, item.id, "Previous job was not found.");
            continue;
        }
        let requestJson = previousJob.requestJson;
        try {
            const parsed = JSON.parse(previousJob.requestJson);
            if (typeof parsed.platformQuotaDate === "string") {
                parsed.platformQuotaDate = await (0, usage_1.reservePlatformQuota)(userId);
                requestJson = JSON.stringify(parsed);
            }
        }
        catch {
            // Keep the original payload; the worker will surface payload problems.
        }
        const job = await db_1.prisma.imageJob.create({
            data: {
                userId,
                status: "pending",
                provider: item.provider,
                model: item.model,
                mode: item.mode,
                prompt: item.prompt,
                requestJson,
                batchId,
                batchItemId: item.id
            }
        });
        jobIds.push(job.id);
        await db_1.prisma.imageBatchItem.update({
            where: { id: item.id },
            data: {
                status: "pending",
                jobId: job.id,
                resultId: null,
                error: null,
                retryCount: { increment: 1 },
                startedAt: null,
                finishedAt: null
            }
        });
    }
    await recalculateImageBatch(batchId);
    return {
        batch: await readImageBatchForUser(userId, batchId),
        jobIds
    };
}
