import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageJobResponse, ImageJobStatus } from "../src/lib/types";
import { getJobMonitorSummary } from "../src/components/studio/utils/job-monitor-summary";

function createJob(
  id: string,
  status: ImageJobStatus,
  overrides: Partial<ImageJobResponse> = {}
): ImageJobResponse {
  return {
    id,
    status,
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    createdAt: "2026-05-26T08:00:00.000Z",
    ...overrides
  };
}

describe("job monitor summary", () => {
  it("groups active, failed, succeeded, and finished jobs", () => {
    const jobs = [
      createJob("pending", "pending"),
      createJob("running", "running"),
      createJob("paused", "paused"),
      createJob("failed", "failed"),
      createJob("succeeded", "succeeded")
    ];

    const summary = getJobMonitorSummary(jobs, null);

    assert.deepEqual(summary.activeJobs.map((job) => job.id), ["pending", "running"]);
    assert.deepEqual(summary.failedJobs.map((job) => job.id), ["failed"]);
    assert.deepEqual(summary.visibleFailedJobs.map((job) => job.id), ["failed"]);
    assert.deepEqual(summary.succeededJobs.map((job) => job.id), ["succeeded"]);
    assert.deepEqual(summary.finishedJobs.map((job) => job.id), ["failed", "succeeded"]);
    assert.equal(summary.alertCount, 3);
  });

  it("hides failed alerts cleared after their finished time", () => {
    const jobs = [
      createJob("active", "running"),
      createJob("old-failed", "failed", {
        createdAt: "2026-05-26T07:00:00.000Z",
        finishedAt: "2026-05-26T07:30:00.000Z"
      }),
      createJob("new-failed", "failed", {
        createdAt: "2026-05-26T09:00:00.000Z",
        finishedAt: "2026-05-26T09:30:00.000Z"
      })
    ];

    const summary = getJobMonitorSummary(jobs, "2026-05-26T08:00:00.000Z");

    assert.deepEqual(summary.visibleFailedJobs.map((job) => job.id), ["new-failed"]);
    assert.equal(summary.alertCount, 2);
  });

  it("uses createdAt as the visibility fallback for failed jobs without finishedAt", () => {
    const jobs = [
      createJob("old-created", "failed", {
        createdAt: "2026-05-26T07:00:00.000Z"
      }),
      createJob("new-created", "failed", {
        createdAt: "2026-05-26T09:00:00.000Z"
      })
    ];

    const summary = getJobMonitorSummary(jobs, "2026-05-26T08:00:00.000Z");

    assert.deepEqual(summary.visibleFailedJobs.map((job) => job.id), ["new-created"]);
    assert.equal(summary.alertCount, 1);
  });

  it("keeps failed alerts visible when the clear timestamp is invalid", () => {
    const jobs = [
      createJob("failed", "failed", {
        createdAt: "2026-05-26T07:00:00.000Z",
        finishedAt: "2026-05-26T07:30:00.000Z"
      })
    ];

    const summary = getJobMonitorSummary(jobs, "not-a-date");

    assert.deepEqual(summary.visibleFailedJobs.map((job) => job.id), ["failed"]);
    assert.equal(summary.alertCount, 1);
  });
});
