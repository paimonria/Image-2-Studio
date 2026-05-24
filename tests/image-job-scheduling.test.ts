import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensurePendingImageJobScheduled,
  repairPendingBatchItemSchedules,
  repairPendingImageJobSchedules,
  type PendingImageJobScheduleDeps
} from "../src/lib/image-job-scheduling";

function createDeps(input: {
  redis: boolean;
  enqueueError?: Error;
}) {
  const enqueued: string[] = [];
  const started: string[] = [];
  const warnings: Array<{ message: string; details: Record<string, unknown> }> = [];

  const deps: PendingImageJobScheduleDeps = {
    isRedisQueueEnabled: () => input.redis,
    enqueueRedisJob: async (jobId) => {
      if (input.enqueueError) throw input.enqueueError;
      enqueued.push(jobId);
    },
    startInlineJob: (jobId) => {
      started.push(jobId);
    },
    warn: (message, details) => {
      warnings.push({ message, details });
    }
  };

  return {
    deps,
    enqueued,
    started,
    warnings
  };
}

describe("pending image job scheduling repair", () => {
  it("re-enqueues pending jobs when Redis queue mode is enabled", async () => {
    const { deps, enqueued, started } = createDeps({ redis: true });

    const result = await ensurePendingImageJobScheduled("job-1", { source: "job-detail" }, deps);

    assert.deepEqual(result, {
      mode: "redis",
      scheduled: true
    });
    assert.deepEqual(enqueued, ["job-1"]);
    assert.deepEqual(started, []);
  });

  it("does not throw status reads when Redis repair enqueue fails", async () => {
    const { deps, enqueued, started, warnings } = createDeps({
      redis: true,
      enqueueError: new Error("redis unavailable")
    });

    const result = await ensurePendingImageJobScheduled("job-2", { source: "job-list-active" }, deps);

    assert.equal(result.mode, "redis");
    assert.equal(result.scheduled, false);
    assert.equal(result.error, "redis unavailable");
    assert.deepEqual(enqueued, []);
    assert.deepEqual(started, []);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.details.jobId, "job-2");
  });

  it("starts the inline scheduler when Redis queue mode is disabled", async () => {
    const { deps, enqueued, started } = createDeps({ redis: false });

    const result = await ensurePendingImageJobScheduled("job-3", { source: "job-detail" }, deps);

    assert.deepEqual(result, {
      mode: "inline",
      scheduled: true
    });
    assert.deepEqual(enqueued, []);
    assert.deepEqual(started, ["job-3"]);
  });

  it("repairs only pending jobs from an active job list up to the configured limit", async () => {
    const { deps, enqueued } = createDeps({ redis: true });

    const attempted = await repairPendingImageJobSchedules(
      [
        { id: "job-1", status: "pending" },
        { id: "job-2", status: "running" },
        { id: "job-3", status: "pending" }
      ],
      { source: "job-list-active" },
      deps,
      { limit: 1 }
    );

    assert.equal(attempted, 1);
    assert.deepEqual(enqueued, ["job-1"]);
  });

  it("repairs pending batch detail items once per job id", async () => {
    const { deps, enqueued } = createDeps({ redis: true });

    const attempted = await repairPendingBatchItemSchedules(
      [
        { jobId: "job-1", status: "pending" },
        { jobId: "job-1", status: "pending" },
        { jobId: "job-2", status: "succeeded" },
        { jobId: null, status: "pending" }
      ],
      { source: "batch-detail", batchId: "batch-1" },
      deps
    );

    assert.equal(attempted, 1);
    assert.deepEqual(enqueued, ["job-1"]);
  });
});
