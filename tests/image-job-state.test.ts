import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveImageJobStatus,
  isForceKillableImageJobStatus,
  isPausableImageJobStatus,
  isResumableImageJobStatus,
  isRetryableBatchItemStatus,
  isRetryableImageJobStatus,
  resolveImageBatchStatusFromItemStatuses
} from "../src/lib/image-job-state";

describe("image job state policy", () => {
  it("allows pausing only pending jobs and resuming only paused jobs", () => {
    assert.equal(isPausableImageJobStatus("pending"), true);
    assert.equal(isPausableImageJobStatus("running"), false);
    assert.equal(isPausableImageJobStatus("succeeded"), false);

    assert.equal(isResumableImageJobStatus("paused"), true);
    assert.equal(isResumableImageJobStatus("pending"), false);
    assert.equal(isResumableImageJobStatus("failed"), false);
  });

  it("tracks active and retryable states explicitly", () => {
    assert.equal(isActiveImageJobStatus("pending"), true);
    assert.equal(isActiveImageJobStatus("running"), true);
    assert.equal(isActiveImageJobStatus("paused"), false);
    assert.equal(isActiveImageJobStatus("failed"), false);

    assert.equal(isRetryableImageJobStatus("failed"), true);
    assert.equal(isRetryableImageJobStatus("succeeded"), false);
    assert.equal(isRetryableBatchItemStatus("failed"), true);
    assert.equal(isRetryableBatchItemStatus("paused"), false);
  });

  it("allows force killing only unfinished job states", () => {
    assert.equal(isForceKillableImageJobStatus("pending"), true);
    assert.equal(isForceKillableImageJobStatus("running"), true);
    assert.equal(isForceKillableImageJobStatus("paused"), true);
    assert.equal(isForceKillableImageJobStatus("succeeded"), false);
    assert.equal(isForceKillableImageJobStatus("failed"), false);
  });

  it("resolves batch status without treating paused items as active work", () => {
    assert.equal(resolveImageBatchStatusFromItemStatuses([]), "queued");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["queued", "pending"]), "queued");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["succeeded", "paused"]), "paused");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["succeeded", "running"]), "running");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["succeeded", "succeeded"]), "succeeded");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["failed", "failed"]), "failed");
    assert.equal(resolveImageBatchStatusFromItemStatuses(["succeeded", "failed"]), "partial");
  });
});
