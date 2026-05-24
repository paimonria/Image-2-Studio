"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireImageBatchIfTimedOut = expireImageBatchIfTimedOut;
const batch_timeout_1 = require("../batch-timeout");
const db_1 = require("./db");
const image_queue_1 = require("./image-queue");
const usage_1 = require("./usage");
function hasUnfinishedItems(batch) {
    return batch.items.some((item) => (0, batch_timeout_1.isUnfinishedBatchItemStatus)(item.status));
}
function getBatchSuccessCount(items) {
    return items.filter((item) => item.status === "succeeded").length;
}
function getBatchFailedCount(items) {
    return items.filter((item) => item.status === "failed").length;
}
function getTimedOutBatchStatus(items) {
    return getBatchSuccessCount(items) > 0 ? "partial" : "failed";
}
async function refundTimedOutJobs(userId, jobs) {
    await Promise.all(jobs.map(async (job) => {
        try {
            const parsed = JSON.parse(job.requestJson);
            await (0, usage_1.refundPlatformQuota)(userId, typeof parsed.platformQuotaDate === "string" ? parsed.platformQuotaDate : undefined);
        }
        catch (error) {
            console.warn("[images/batches] could not parse job payload for timeout quota refund", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }));
}
async function removePendingQueueJobs(jobs) {
    await Promise.all(jobs
        .filter((job) => job.status === "pending")
        .map(async (job) => {
        try {
            await (0, image_queue_1.removeQueuedImageJob)(job.id);
        }
        catch (error) {
            console.warn("[images/batches] queued job could not be removed during timeout cleanup", {
                jobId: job.id,
                cause: error instanceof Error ? error.message : String(error)
            });
        }
    }));
}
async function expireImageBatchIfTimedOut(userId, batch, now = new Date()) {
    if (batch.finishedAt || !hasUnfinishedItems(batch) || !(0, batch_timeout_1.isBatchTimedOut)(batch.createdAt, now)) {
        return false;
    }
    const timedOutAt = now;
    const timedOutItems = batch.items.filter((item) => (0, batch_timeout_1.isUnfinishedBatchItemStatus)(item.status));
    const timedOutItemIds = timedOutItems.map((item) => item.id);
    const timedOutJobIds = timedOutItems
        .map((item) => item.jobId)
        .filter((jobId) => Boolean(jobId));
    const jobs = timedOutJobIds.length > 0
        ? await db_1.prisma.imageJob.findMany({
            where: {
                userId,
                id: { in: timedOutJobIds }
            }
        })
        : [];
    const unfinishedJobs = jobs.filter((job) => job.status === "pending" || job.status === "running" || job.status === "paused");
    await db_1.prisma.$transaction(async (tx) => {
        if (timedOutItemIds.length > 0) {
            await tx.imageBatchItem.updateMany({
                where: {
                    batchId: batch.id,
                    userId,
                    id: { in: timedOutItemIds },
                    status: { in: ["queued", "creating", "pending", "running", "paused"] }
                },
                data: {
                    status: "failed",
                    error: batch_timeout_1.BATCH_QUEUE_TIMEOUT_ERROR,
                    finishedAt: timedOutAt
                }
            });
        }
        if (timedOutJobIds.length > 0) {
            await Promise.all(unfinishedJobs.map((job) => tx.imageJob.updateMany({
                where: {
                    userId,
                    batchId: batch.id,
                    id: job.id,
                    status: { in: ["pending", "running", "paused"] }
                },
                data: {
                    status: "failed",
                    error: batch_timeout_1.BATCH_QUEUE_TIMEOUT_ERROR,
                    lockedBy: null,
                    lockedAt: null,
                    heartbeatAt: null,
                    finishedAt: timedOutAt,
                    executionMs: job.startedAt ? Math.max(0, timedOutAt.getTime() - job.startedAt.getTime()) : undefined
                }
            })));
        }
        const nextItems = batch.items.map((item) => ((0, batch_timeout_1.isUnfinishedBatchItemStatus)(item.status)
            ? { ...item, status: "failed" }
            : item));
        await tx.imageBatch.update({
            where: { id: batch.id },
            data: {
                status: getTimedOutBatchStatus(nextItems),
                successCount: getBatchSuccessCount(nextItems),
                failedCount: getBatchFailedCount(nextItems),
                finishedAt: timedOutAt
            }
        });
    });
    await Promise.all([
        removePendingQueueJobs(jobs),
        refundTimedOutJobs(userId, unfinishedJobs)
    ]);
    return true;
}
