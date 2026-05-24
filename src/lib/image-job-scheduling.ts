export type PendingImageJobScheduleContext = {
  source: string;
  batchId?: string;
};

export type PendingImageJobScheduleDeps = {
  isRedisQueueEnabled: () => boolean;
  enqueueRedisJob: (jobId: string) => Promise<unknown>;
  startInlineJob: (jobId: string) => void;
  warn?: (message: string, details: Record<string, unknown>) => void;
};

export type PendingImageJobScheduleResult = {
  mode: "redis" | "inline";
  scheduled: boolean;
  error?: string;
};

export const DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT = 30;

function normalizeRepairLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT;
  return Math.min(Math.max(Math.trunc(limit ?? DEFAULT_PENDING_IMAGE_JOB_REPAIR_LIMIT), 1), 100);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

function getWarningDetails(jobId: string, context: PendingImageJobScheduleContext, error: unknown) {
  return {
    jobId,
    source: context.source,
    batchId: context.batchId,
    cause: getErrorMessage(error)
  };
}

export async function ensurePendingImageJobScheduled(
  jobId: string,
  context: PendingImageJobScheduleContext,
  deps: PendingImageJobScheduleDeps
): Promise<PendingImageJobScheduleResult> {
  if (deps.isRedisQueueEnabled()) {
    try {
      await deps.enqueueRedisJob(jobId);
      return {
        mode: "redis",
        scheduled: true
      };
    } catch (error) {
      deps.warn?.(
        "[images/jobs] pending job could not be repaired into the Redis queue",
        getWarningDetails(jobId, context, error)
      );
      return {
        mode: "redis",
        scheduled: false,
        error: getErrorMessage(error)
      };
    }
  }

  deps.startInlineJob(jobId);
  return {
    mode: "inline",
    scheduled: true
  };
}

export async function repairPendingImageJobSchedules<T extends { id: string; status: string }>(
  jobs: T[],
  context: PendingImageJobScheduleContext,
  deps: PendingImageJobScheduleDeps,
  options: { limit?: number } = {}
) {
  const limit = normalizeRepairLimit(options.limit);
  let attempted = 0;

  for (const job of jobs) {
    if (attempted >= limit) break;
    if (job.status !== "pending") continue;

    attempted += 1;
    await ensurePendingImageJobScheduled(job.id, context, deps);
  }

  return attempted;
}

export async function repairPendingBatchItemSchedules<T extends { jobId?: string | null; status: string }>(
  items: T[],
  context: PendingImageJobScheduleContext,
  deps: PendingImageJobScheduleDeps,
  options: { limit?: number } = {}
) {
  const limit = normalizeRepairLimit(options.limit);
  const seenJobIds = new Set<string>();
  let attempted = 0;

  for (const item of items) {
    if (attempted >= limit) break;
    const jobId = item.jobId?.trim();
    if (item.status !== "pending" || !jobId || seenJobIds.has(jobId)) continue;

    seenJobIds.add(jobId);
    attempted += 1;
    await ensurePendingImageJobScheduled(jobId, context, deps);
  }

  return attempted;
}
