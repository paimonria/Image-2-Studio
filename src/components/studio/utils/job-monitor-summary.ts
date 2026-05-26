import { isActiveImageJobStatus } from "../../../lib/image-job-state";
import {
  filterImageJobsAfterFinishedClear,
  isFinishedImageJobStatus
} from "../../../lib/job-monitor";
import type { ImageJobResponse } from "../../../lib/types";

export type JobMonitorSummary = {
  activeJobs: ImageJobResponse[];
  failedJobs: ImageJobResponse[];
  visibleFailedJobs: ImageJobResponse[];
  succeededJobs: ImageJobResponse[];
  finishedJobs: ImageJobResponse[];
  alertCount: number;
};

export function getJobMonitorSummary(
  jobs: readonly ImageJobResponse[],
  clearedAt: string | null | undefined
): JobMonitorSummary {
  const activeJobs = jobs.filter((job) => isActiveImageJobStatus(job.status));
  const failedJobs = jobs.filter((job) => job.status === "failed");
  const visibleFailedJobs = filterImageJobsAfterFinishedClear(failedJobs, clearedAt);
  const succeededJobs = jobs.filter((job) => job.status === "succeeded");
  const finishedJobs = jobs.filter((job) => isFinishedImageJobStatus(job.status));

  return {
    activeJobs,
    failedJobs,
    visibleFailedJobs,
    succeededJobs,
    finishedJobs,
    alertCount: activeJobs.length + visibleFailedJobs.length
  };
}
