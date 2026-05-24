"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const db_1 = require("../lib/server/db");
const image_queue_1 = require("../lib/server/image-queue");
const image_jobs_1 = require("../lib/server/image-jobs");
const image_worker_startup_1 = require("../lib/image-worker-startup");
function requireRedisQueue() {
    if (!(0, image_queue_1.isImageQueueEnabled)()) {
        throw new Error("REDIS_URL must be set before starting the image worker.");
    }
}
function getJobId(job) {
    const jobId = job.data.jobId;
    if (typeof jobId !== "string" || !jobId.trim()) {
        throw new Error("Queue job payload is missing jobId.");
    }
    return jobId.trim();
}
async function shutdown(worker, signal) {
    console.log(`[image-worker] received ${signal}; closing worker`);
    await worker.close();
    await db_1.prisma.$disconnect();
    process.exit(0);
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function restorePendingImageJobsWhenSchemaReady() {
    const { attempts, delayMs } = (0, image_worker_startup_1.getImageWorkerSchemaWaitConfig)();
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await (0, image_jobs_1.restorePendingImageJobsToQueue)();
        }
        catch (error) {
            if (!(0, image_worker_startup_1.isMissingImageJobTableError)(error) || attempt >= attempts) {
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
    const queueHealth = await (0, image_queue_1.assertImageQueueConnectionReady)();
    const restoredJobs = await restorePendingImageJobsWhenSchemaReady();
    console.log("[image-worker] redis queue ready", {
        target: queueHealth.target,
        restoredJobs
    });
    const connection = (0, image_queue_1.getImageWorkerConnection)();
    const worker = new bullmq_1.Worker(image_queue_1.IMAGE_QUEUE_NAME, async (job) => {
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
        await (0, image_jobs_1.runClaimedImageJobById)(jobId, { retryable: attemptsRemaining });
    }, {
        connection,
        prefix: (0, image_queue_1.getImageQueuePrefix)(),
        concurrency: (0, image_queue_1.getImageWorkerConcurrency)()
    });
    worker.on("completed", (job) => {
        console.log("[image-worker] completed", { bullJobId: job.id, imageJobId: job.data.jobId });
    });
    worker.on("failed", (job, error) => {
        console.error("[image-worker] failed", {
            bullJobId: job?.id,
            imageJobId: job?.data.jobId,
            attemptsMade: job?.attemptsMade,
            cause: error instanceof Error ? error.message : String(error)
        });
    });
    worker.on("error", (error) => {
        console.error("[image-worker] worker error", {
            cause: error instanceof Error ? error.message : String(error)
        });
    });
    await worker.waitUntilReady();
    console.log("[image-worker] ready", {
        queue: image_queue_1.IMAGE_QUEUE_NAME,
        concurrency: (0, image_queue_1.getImageWorkerConcurrency)()
    });
    process.on("SIGINT", () => void shutdown(worker, "SIGINT"));
    process.on("SIGTERM", () => void shutdown(worker, "SIGTERM"));
}
void main().catch(async (error) => {
    console.error("[image-worker] startup failed", {
        cause: error instanceof Error ? error.message : String(error)
    });
    await db_1.prisma.$disconnect();
    process.exit(1);
});
