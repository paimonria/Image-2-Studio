"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_QUEUE_NAME = void 0;
exports.getImageQueueRedisTarget = getImageQueueRedisTarget;
exports.isImageQueueEnabled = isImageQueueEnabled;
exports.getImageQueuePrefix = getImageQueuePrefix;
exports.getImageQueueAttempts = getImageQueueAttempts;
exports.getImageQueueBackoffMs = getImageQueueBackoffMs;
exports.getImageWorkerConcurrency = getImageWorkerConcurrency;
exports.getImageQueueConnection = getImageQueueConnection;
exports.getImageWorkerConnection = getImageWorkerConnection;
exports.getImageQueueOptions = getImageQueueOptions;
exports.getImageQueueJobOptions = getImageQueueJobOptions;
exports.getImageQueue = getImageQueue;
exports.checkImageQueueConnection = checkImageQueueConnection;
exports.assertImageQueueConnectionReady = assertImageQueueConnectionReady;
exports.getImageQueueJobCounts = getImageQueueJobCounts;
exports.removeQueuedImageJob = removeQueuedImageJob;
exports.enqueueImageJob = enqueueImageJob;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
exports.IMAGE_QUEUE_NAME = "image-jobs";
let imageQueue = null;
let imageQueueConnection = null;
const REDIS_ERROR_LOG_THROTTLE_MS = 30 * 1000;
const redisErrorLogTimestamps = new Map();
function getRedisUrl() {
    return process.env.REDIS_URL?.trim() || "";
}
function getImageQueueRedisTarget() {
    const redisUrl = getRedisUrl();
    if (!redisUrl)
        return "disabled";
    try {
        const url = new URL(redisUrl);
        const db = url.pathname && url.pathname !== "/" ? url.pathname : "";
        return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${db}`;
    }
    catch {
        return "invalid REDIS_URL";
    }
}
function getImageQueueRedisOptions() {
    return {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        enableOfflineQueue: false
    };
}
function getImageWorkerRedisOptions() {
    return {
        maxRetriesPerRequest: null,
        enableReadyCheck: false
    };
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function logRedisConnectionError(scope, error) {
    const cause = getErrorMessage(error);
    const key = `${scope}:${cause}`;
    const now = Date.now();
    const lastLoggedAt = redisErrorLogTimestamps.get(key) ?? 0;
    if (now - lastLoggedAt < REDIS_ERROR_LOG_THROTTLE_MS)
        return;
    redisErrorLogTimestamps.set(key, now);
    console.error("[image-queue] redis connection error", {
        scope,
        target: getImageQueueRedisTarget(),
        cause
    });
}
function attachRedisErrorHandler(connection, scope, options = {}) {
    connection.on("error", (error) => {
        if (options.log === false)
            return;
        logRedisConnectionError(scope, error);
    });
    return connection;
}
function isImageQueueEnabled() {
    return Boolean(getRedisUrl());
}
function getImageQueuePrefix() {
    return process.env.IMAGE_QUEUE_PREFIX?.trim() || "image2";
}
function getImageQueueAttempts() {
    const parsed = Number.parseInt(process.env.IMAGE_QUEUE_ATTEMPTS ?? "", 10);
    if (!Number.isFinite(parsed))
        return 3;
    return Math.min(Math.max(parsed, 1), 20);
}
function getImageQueueBackoffMs() {
    const parsed = Number.parseInt(process.env.IMAGE_QUEUE_BACKOFF_MS ?? "", 10);
    if (!Number.isFinite(parsed))
        return 5000;
    return Math.min(Math.max(parsed, 0), 10 * 60 * 1000);
}
function getImageWorkerConcurrency() {
    const parsed = Number.parseInt(process.env.IMAGE_WORKER_CONCURRENCY ?? "", 10);
    if (!Number.isFinite(parsed))
        return 8;
    return Math.min(Math.max(parsed, 1), 64);
}
function getImageQueueConnection() {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
        throw new Error("REDIS_URL must be set to use the image job queue.");
    }
    if (!imageQueueConnection) {
        imageQueueConnection = attachRedisErrorHandler(new ioredis_1.default(redisUrl, getImageQueueRedisOptions()), "queue");
    }
    return imageQueueConnection;
}
function getImageWorkerConnection() {
    const redisUrl = getRedisUrl();
    if (!redisUrl) {
        throw new Error("REDIS_URL must be set to use the image worker.");
    }
    return attachRedisErrorHandler(new ioredis_1.default(redisUrl, getImageWorkerRedisOptions()), "worker");
}
function getImageQueueOptions() {
    return {
        connection: getImageQueueConnection(),
        prefix: getImageQueuePrefix()
    };
}
function getImageQueueJobOptions() {
    return {
        attempts: getImageQueueAttempts(),
        backoff: {
            type: "exponential",
            delay: getImageQueueBackoffMs()
        },
        removeOnComplete: {
            age: 24 * 60 * 60,
            count: 5000
        },
        removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 10000
        }
    };
}
function getImageQueue() {
    if (!imageQueue) {
        imageQueue = new bullmq_1.Queue(exports.IMAGE_QUEUE_NAME, getImageQueueOptions());
        imageQueue.on("error", (error) => {
            logRedisConnectionError("queue", error);
        });
    }
    return imageQueue;
}
async function checkImageQueueConnection() {
    if (!isImageQueueEnabled()) {
        return {
            enabled: false,
            ok: true,
            target: getImageQueueRedisTarget()
        };
    }
    const connection = attachRedisErrorHandler(new ioredis_1.default(getRedisUrl(), {
        ...getImageQueueRedisOptions(),
        enableReadyCheck: false,
        lazyConnect: true,
        retryStrategy: () => undefined
    }), "health", { log: false });
    try {
        await connection.connect();
        await connection.ping();
        await connection.info();
        return {
            enabled: true,
            ok: true,
            target: getImageQueueRedisTarget()
        };
    }
    catch (error) {
        return {
            enabled: true,
            ok: false,
            target: getImageQueueRedisTarget(),
            error: getErrorMessage(error)
        };
    }
    finally {
        connection.disconnect();
    }
}
async function assertImageQueueConnectionReady() {
    const health = await checkImageQueueConnection();
    if (!health.ok) {
        throw new Error(`Redis queue is not reachable at ${health.target}: ${health.error ?? "unknown error"}`);
    }
    return health;
}
async function getImageQueueJobCounts() {
    if (!isImageQueueEnabled()) {
        return {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0
        };
    }
    const counts = await getImageQueue().getJobCounts("waiting", "active", "delayed", "failed", "completed");
    return {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0
    };
}
async function removeQueuedImageJob(jobId) {
    if (!isImageQueueEnabled())
        return false;
    const job = await getImageQueue().getJob(jobId);
    if (!job)
        return false;
    await job.remove();
    return true;
}
async function enqueueImageJob(jobId) {
    if (!isImageQueueEnabled())
        return false;
    const queue = getImageQueue();
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
        const state = await existingJob.getState();
        if (state === "completed" || state === "failed") {
            await existingJob.remove();
        }
        else {
            return true;
        }
    }
    await queue.add("generate", { jobId }, {
        ...getImageQueueJobOptions(),
        jobId
    });
    return true;
}
