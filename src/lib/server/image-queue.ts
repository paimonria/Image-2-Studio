import { Queue } from "bullmq";
import type { JobsOptions, QueueOptions } from "bullmq";
import IORedis from "ioredis";

export const IMAGE_QUEUE_NAME = "image-jobs";

type ImageQueuePayload = {
  jobId: string;
};

let imageQueue: Queue<ImageQueuePayload> | null = null;
let imageQueueConnection: IORedis | null = null;
const REDIS_ERROR_LOG_THROTTLE_MS = 30 * 1000;
const redisErrorLogTimestamps = new Map<string, number>();

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || "";
}

export function getImageQueueRedisTarget() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) return "disabled";

  try {
    const url = new URL(redisUrl);
    const db = url.pathname && url.pathname !== "/" ? url.pathname : "";
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${db}`;
  } catch {
    return "invalid REDIS_URL";
  }
}

function getImageQueueRedisOptions() {
  return {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    enableOfflineQueue: false
  } as const;
}

function getImageWorkerRedisOptions() {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  } as const;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logRedisConnectionError(scope: string, error: unknown) {
  const cause = getErrorMessage(error);
  const key = `${scope}:${cause}`;
  const now = Date.now();
  const lastLoggedAt = redisErrorLogTimestamps.get(key) ?? 0;
  if (now - lastLoggedAt < REDIS_ERROR_LOG_THROTTLE_MS) return;

  redisErrorLogTimestamps.set(key, now);
  console.error("[image-queue] redis connection error", {
    scope,
    target: getImageQueueRedisTarget(),
    cause
  });
}

function attachRedisErrorHandler(
  connection: IORedis,
  scope: string,
  options: { log?: boolean } = {}
) {
  connection.on("error", (error: Error) => {
    if (options.log === false) return;
    logRedisConnectionError(scope, error);
  });

  return connection;
}

export function isImageQueueEnabled() {
  return Boolean(getRedisUrl());
}

export function getImageQueuePrefix() {
  return process.env.IMAGE_QUEUE_PREFIX?.trim() || "image2";
}

export function getImageQueueAttempts() {
  const parsed = Number.parseInt(process.env.IMAGE_QUEUE_ATTEMPTS ?? "", 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(Math.max(parsed, 1), 20);
}

export function getImageQueueBackoffMs() {
  const parsed = Number.parseInt(process.env.IMAGE_QUEUE_BACKOFF_MS ?? "", 10);
  if (!Number.isFinite(parsed)) return 5000;
  return Math.min(Math.max(parsed, 0), 10 * 60 * 1000);
}

export function getImageWorkerConcurrency() {
  const parsed = Number.parseInt(process.env.IMAGE_WORKER_CONCURRENCY ?? "", 10);
  if (!Number.isFinite(parsed)) return 8;
  return Math.min(Math.max(parsed, 1), 64);
}

export function getImageQueueConnection() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    throw new Error("REDIS_URL must be set to use the image job queue.");
  }

  if (!imageQueueConnection) {
    imageQueueConnection = attachRedisErrorHandler(
      new IORedis(redisUrl, getImageQueueRedisOptions()),
      "queue"
    );
  }

  return imageQueueConnection;
}

export function getImageWorkerConnection() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    throw new Error("REDIS_URL must be set to use the image worker.");
  }

  return attachRedisErrorHandler(
    new IORedis(redisUrl, getImageWorkerRedisOptions()),
    "worker"
  );
}

export function getImageQueueOptions(): QueueOptions {
  return {
    connection: getImageQueueConnection(),
    prefix: getImageQueuePrefix()
  };
}

export function getImageQueueJobOptions(): JobsOptions {
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

export function getImageQueue() {
  if (!imageQueue) {
    imageQueue = new Queue<ImageQueuePayload>(IMAGE_QUEUE_NAME, getImageQueueOptions());
    imageQueue.on("error", (error: Error) => {
      logRedisConnectionError("queue", error);
    });
  }

  return imageQueue;
}

export async function checkImageQueueConnection() {
  if (!isImageQueueEnabled()) {
    return {
      enabled: false,
      ok: true,
      target: getImageQueueRedisTarget()
    };
  }

  const connection = attachRedisErrorHandler(
    new IORedis(getRedisUrl(), {
      ...getImageQueueRedisOptions(),
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => undefined
    }),
    "health",
    { log: false }
  );

  try {
    await connection.connect();
    await connection.ping();
    await connection.info();
    return {
      enabled: true,
      ok: true,
      target: getImageQueueRedisTarget()
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      target: getImageQueueRedisTarget(),
      error: getErrorMessage(error)
    };
  } finally {
    connection.disconnect();
  }
}

export async function assertImageQueueConnectionReady() {
  const health = await checkImageQueueConnection();
  if (!health.ok) {
    throw new Error(`Redis queue is not reachable at ${health.target}: ${health.error ?? "unknown error"}`);
  }

  return health;
}

export async function getImageQueueJobCounts() {
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

export async function removeQueuedImageJob(jobId: string) {
  if (!isImageQueueEnabled()) return false;

  const job = await getImageQueue().getJob(jobId);
  if (!job) return false;

  await job.remove();
  return true;
}

export async function enqueueImageJob(jobId: string) {
  if (!isImageQueueEnabled()) return false;

  const queue = getImageQueue();
  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state === "completed" || state === "failed") {
      await existingJob.remove();
    } else {
      return true;
    }
  }

  await queue.add(
    "generate",
    { jobId },
    {
      ...getImageQueueJobOptions(),
      jobId
    }
  );

  return true;
}
