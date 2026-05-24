import { Worker } from "bullmq";
import type { Job } from "bullmq";
import { prisma } from "../lib/server/db";
import {
  getImageWorkerConnection,
  getImageWorkerConcurrency,
  getImageQueuePrefix,
  assertImageQueueConnectionReady,
  IMAGE_QUEUE_NAME,
  isImageQueueEnabled
} from "../lib/server/image-queue";
import { restorePendingImageJobsToQueue, runClaimedImageJobById } from "../lib/server/image-jobs";
import { getImageWorkerSchemaWaitConfig, isMissingImageJobTableError } from "../lib/image-worker-startup";

type ImageQueuePayload = {
  jobId?: unknown;
};

function requireRedisQueue() {
  if (!isImageQueueEnabled()) {
    throw new Error("REDIS_URL must be set before starting the image worker.");
  }
}

function getJobId(job: Job<ImageQueuePayload>) {
  const jobId = job.data.jobId;
  if (typeof jobId !== "string" || !jobId.trim()) {
    throw new Error("Queue job payload is missing jobId.");
  }

  return jobId.trim();
}

async function shutdown(worker: Worker<ImageQueuePayload>, signal: string) {
  console.log(`[image-worker] received ${signal}; closing worker`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function restorePendingImageJobsWhenSchemaReady() {
  const { attempts, delayMs } = getImageWorkerSchemaWaitConfig();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await restorePendingImageJobsToQueue();
    } catch (error) {
      if (!isMissingImageJobTableError(error) || attempt >= attempts) {
        throw error;
      }

      console.warn("[image-worker] ImageJob table is not ready; waiting for database migrations", {
        attempt,
        attempts,
        retryInMs: delayMs
      });
      await wait(delayMs);
    }
  }

  return 0;
}

async function main() {
  requireRedisQueue();
  const queueHealth = await assertImageQueueConnectionReady();
  const restoredJobs = await restorePendingImageJobsWhenSchemaReady();
  console.log("[image-worker] redis queue ready", {
    target: queueHealth.target,
    restoredJobs
  });

  const connection = getImageWorkerConnection();
  const worker = new Worker<ImageQueuePayload>(
    IMAGE_QUEUE_NAME,
    async (job: Job<ImageQueuePayload>) => {
      const jobId = getJobId(job);
      const attemptsRemaining = job.opts.attempts
        ? job.attemptsMade + 1 < job.opts.attempts
        : false;

      console.log("[image-worker] started", {
        bullJobId: job.id,
        imageJobId: jobId,
        attemptsMade: job.attemptsMade,
        attemptsConfigured: job.opts.attempts,
        attemptsRemaining
      });

      await runClaimedImageJobById(jobId, { retryable: attemptsRemaining });
    },
    {
      connection,
      prefix: getImageQueuePrefix(),
      concurrency: getImageWorkerConcurrency()
    }
  );

  worker.on("completed", (job: Job<ImageQueuePayload>) => {
    console.log("[image-worker] completed", { bullJobId: job.id, imageJobId: job.data.jobId });
  });

  worker.on("failed", (job: Job<ImageQueuePayload> | undefined, error: Error) => {
    console.error("[image-worker] failed", {
      bullJobId: job?.id,
      imageJobId: job?.data.jobId,
      attemptsMade: job?.attemptsMade,
      cause: error instanceof Error ? error.message : String(error)
    });
  });

  worker.on("error", (error: Error) => {
    console.error("[image-worker] worker error", {
      cause: error instanceof Error ? error.message : String(error)
    });
  });

  await worker.waitUntilReady();
  console.log("[image-worker] ready", {
    queue: IMAGE_QUEUE_NAME,
    concurrency: getImageWorkerConcurrency()
  });

  process.on("SIGINT", () => void shutdown(worker, "SIGINT"));
  process.on("SIGTERM", () => void shutdown(worker, "SIGTERM"));
}

void main().catch(async (error) => {
  console.error("[image-worker] startup failed", {
    cause: error instanceof Error ? error.message : String(error)
  });
  await prisma.$disconnect();
  process.exit(1);
});
