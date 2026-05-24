import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFinishedJobAfterClearFilter,
  buildFinishedJobVisibilityFilter,
  buildVisibleFinishedJobWhere,
  filterImageJobsAfterFinishedClear,
  isFinishedImageJobStatus
} from "../src/lib/job-monitor";

describe("job monitor archive policy", () => {
  it("classifies only succeeded and failed jobs as finished", () => {
    assert.equal(isFinishedImageJobStatus("succeeded"), true);
    assert.equal(isFinishedImageJobStatus("failed"), true);
    assert.equal(isFinishedImageJobStatus("pending"), false);
    assert.equal(isFinishedImageJobStatus("paused"), false);
    assert.equal(isFinishedImageJobStatus("running"), false);
  });

  it("keeps active and paused jobs visible after clearing finished jobs", () => {
    const clearedAt = "2026-05-23T10:00:00.000Z";
    const jobs = [
      { id: "pending", status: "pending", createdAt: "2026-05-23T09:00:00.000Z" },
      { id: "paused", status: "paused", createdAt: "2026-05-23T09:00:00.000Z" },
      { id: "running", status: "running", createdAt: "2026-05-23T09:00:00.000Z" },
      { id: "old-success", status: "succeeded", createdAt: "2026-05-23T08:00:00.000Z", finishedAt: "2026-05-23T09:00:00.000Z" },
      { id: "new-failure", status: "failed", createdAt: "2026-05-23T08:00:00.000Z", finishedAt: "2026-05-23T10:01:00.000Z" }
    ];

    assert.deepEqual(
      filterImageJobsAfterFinishedClear(jobs, clearedAt).map((job) => job.id),
      ["pending", "paused", "running", "new-failure"]
    );
  });

  it("uses createdAt as a fallback when a finished job has no finishedAt", () => {
    const clearedAt = "2026-05-23T10:00:00.000Z";
    const jobs = [
      { id: "old-fallback", status: "failed", createdAt: "2026-05-23T09:59:59.000Z" },
      { id: "new-fallback", status: "failed", createdAt: "2026-05-23T10:00:01.000Z" }
    ];

    assert.deepEqual(
      filterImageJobsAfterFinishedClear(jobs, clearedAt).map((job) => job.id),
      ["new-fallback"]
    );
  });

  it("builds Prisma-compatible filters for recent and failed monitor views", () => {
    const clearedAt = new Date("2026-05-23T10:00:00.000Z");

    assert.deepEqual(buildFinishedJobVisibilityFilter(clearedAt), {
      OR: [
        { status: { notIn: ["succeeded", "failed"] } },
        { finishedAt: { gt: clearedAt } },
        { finishedAt: null, createdAt: { gt: clearedAt } }
      ]
    });

    assert.deepEqual(buildFinishedJobAfterClearFilter(clearedAt), {
      OR: [
        { finishedAt: { gt: clearedAt } },
        { finishedAt: null, createdAt: { gt: clearedAt } }
      ]
    });

    assert.deepEqual(buildVisibleFinishedJobWhere("user-1", clearedAt), {
      userId: "user-1",
      status: { in: ["succeeded", "failed"] },
      OR: [
        { finishedAt: { gt: clearedAt } },
        { finishedAt: null, createdAt: { gt: clearedAt } }
      ]
    });
  });
});
