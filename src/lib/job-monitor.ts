import type { ImageJobStatus } from "./types";

export const FINISHED_IMAGE_JOB_STATUSES = ["succeeded", "failed"] as const;

type JobMonitorClearTime = Date | string | null | undefined;
type JobMonitorComparableJob = {
  status: ImageJobStatus | string;
  createdAt: string;
  finishedAt?: string;
};

type FinishedJobAfterClearFilter = {
  OR: Array<
    | { finishedAt: { gt: Date } }
    | { finishedAt: null; createdAt: { gt: Date } }
  >;
};

type FinishedJobVisibilityFilter = {
  OR: Array<
    | { status: { notIn: string[] } }
    | { finishedAt: { gt: Date } }
    | { finishedAt: null; createdAt: { gt: Date } }
  >;
};

export function isFinishedImageJobStatus(status: ImageJobStatus | string) {
  return status === "succeeded" || status === "failed";
}

function parseClearTime(value: JobMonitorClearTime) {
  if (!value) return null;

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function getImageJobMonitorFinishedAtMs(job: JobMonitorComparableJob) {
  const finishedAtMs = parseClearTime(job.finishedAt);
  if (finishedAtMs !== null) return finishedAtMs;

  return parseClearTime(job.createdAt);
}

export function isImageJobVisibleAfterFinishedClear(job: JobMonitorComparableJob, clearedAt: JobMonitorClearTime) {
  if (!isFinishedImageJobStatus(job.status)) return true;

  const clearedAtMs = parseClearTime(clearedAt);
  if (clearedAtMs === null) return true;

  const finishedAtMs = getImageJobMonitorFinishedAtMs(job);
  return finishedAtMs !== null && finishedAtMs > clearedAtMs;
}

export function filterImageJobsAfterFinishedClear<T extends JobMonitorComparableJob>(jobs: T[], clearedAt: JobMonitorClearTime) {
  return jobs.filter((job) => isImageJobVisibleAfterFinishedClear(job, clearedAt));
}

export function buildFinishedJobAfterClearFilter(clearedAt: Date | null | undefined): FinishedJobAfterClearFilter | null {
  if (!clearedAt) return null;

  return {
    OR: [
      { finishedAt: { gt: clearedAt } },
      {
        finishedAt: null,
        createdAt: { gt: clearedAt }
      }
    ]
  };
}

export function buildFinishedJobVisibilityFilter(clearedAt: Date | null | undefined): FinishedJobVisibilityFilter | null {
  if (!clearedAt) return null;

  return {
    OR: [
      { status: { notIn: [...FINISHED_IMAGE_JOB_STATUSES] } },
      { finishedAt: { gt: clearedAt } },
      {
        finishedAt: null,
        createdAt: { gt: clearedAt }
      }
    ]
  };
}

export function buildVisibleFinishedJobWhere(userId: string, clearedAt: Date | null | undefined) {
  return {
    userId,
    status: { in: [...FINISHED_IMAGE_JOB_STATUSES] },
    ...(buildFinishedJobAfterClearFilter(clearedAt) ?? {})
  };
}
