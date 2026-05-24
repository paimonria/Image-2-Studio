import { BATCH_QUEUE_TIMEOUT_ERROR, isBatchTimedOut, isUnfinishedBatchItemStatus } from "../batch-timeout";
import type { ImageBatchItemStatus } from "../types";
import { prisma } from "./db";
import { removeQueuedImageJob } from "./image-queue";
import { refundPlatformQuota } from "./usage";

type TimeoutJob = {
  id: string;
  status: string;
  requestJson: string;
  startedAt: Date | null;
};

type TimeoutBatch = {
  id: string;
  createdAt: Date;
  finishedAt: Date | null;
  items: Array<{
    id: string;
    status: string;
    jobId: string | null;
  }>;
};

function hasUnfinishedItems(batch: TimeoutBatch) {
  return batch.items.some((item) => isUnfinishedBatchItemStatus(item.status));
}

function getBatchSuccessCount(items: TimeoutBatch["items"]) {
  return items.filter((item) => item.status === "succeeded").length;
}

function getBatchFailedCount(items: TimeoutBatch["items"]) {
  return items.filter((item) => item.status === "failed").length;
}

function getTimedOutBatchStatus(items: TimeoutBatch["items"]) {
  return getBatchSuccessCount(items) > 0 ? "partial" : "failed";
}

async function refundTimedOutJobs(userId: string, jobs: TimeoutJob[]) {
  await Promise.all(jobs.map(async (job) => {
    try {
      const parsed = JSON.parse(job.requestJson) as { platformQuotaDate?: unknown };
      await refundPlatformQuota(userId, typeof parsed.platformQuotaDate === "string" ? parsed.platformQuotaDate : undefined);
    } catch (error) {
      console.warn("[images/batches] could not parse job payload for timeout quota refund", {
        jobId: job.id,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }));
}

async function removePendingQueueJobs(jobs: TimeoutJob[]) {
  await Promise.all(jobs
    .filter((job) => job.status === "pending")
    .map(async (job) => {
      try {
        await removeQueuedImageJob(job.id);
      } catch (error) {
        console.warn("[images/batches] queued job could not be removed during timeout cleanup", {
          jobId: job.id,
          cause: error instanceof Error ? error.message : String(error)
        });
      }
    }));
}

export async function expireImageBatchIfTimedOut(userId: string, batch: TimeoutBatch, now = new Date()) {
  if (batch.finishedAt || !hasUnfinishedItems(batch) || !isBatchTimedOut(batch.createdAt, now)) {
    return false;
  }

  const timedOutAt = now;
  const timedOutItems = batch.items.filter((item) => isUnfinishedBatchItemStatus(item.status));
  const timedOutItemIds = timedOutItems.map((item) => item.id);
const timedOutJobIds = timedOutItems
    .map((item) => item.jobId)
    .filter((jobId): jobId is string => Boolean(jobId));
  const jobs = timedOutJobIds.length > 0
    ? await prisma.imageJob.findMany({
        where: {
          userId,
          id: { in: timedOutJobIds }
        }
      }) as unknown as TimeoutJob[]
    : [];
  const unfinishedJobs = jobs.filter((job) => job.status === "pending" || job.status === "running" || job.status === "paused");

  await prisma.$transaction(async (tx) => {
    if (timedOutItemIds.length > 0) {
      await tx.imageBatchItem.updateMany({
        where: {
          batchId: batch.id,
          userId,
          id: { in: timedOutItemIds },
          status: { in: ["queued", "creating", "pending", "running", "paused"] satisfies ImageBatchItemStatus[] }
        },
        data: {
          status: "failed",
          error: BATCH_QUEUE_TIMEOUT_ERROR,
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
          error: BATCH_QUEUE_TIMEOUT_ERROR,
          lockedBy: null,
          lockedAt: null,
          heartbeatAt: null,
          finishedAt: timedOutAt,
          executionMs: job.startedAt ? Math.max(0, timedOutAt.getTime() - job.startedAt.getTime()) : undefined
        }
      })));
    }

    const nextItems = batch.items.map((item) => (
      isUnfinishedBatchItemStatus(item.status)
        ? { ...item, status: "failed" }
        : item
    ));

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
