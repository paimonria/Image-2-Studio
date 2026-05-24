import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BATCH_QUEUE_TIMEOUT_ERROR,
  BATCH_QUEUE_TIMEOUT_MS,
  isBatchTimedOut,
  isUnfinishedBatchItemStatus
} from "../src/lib/batch-timeout";
import { resolveImageBatchStatusFromItemStatuses } from "../src/lib/image-job-state";

describe("batch timeout policy", () => {
  it("does not time out batches at or below the 10 minute limit", () => {
    const createdAt = new Date("2026-05-23T10:00:00.000Z");
    assert.equal(isBatchTimedOut(createdAt, new Date(createdAt.getTime() + BATCH_QUEUE_TIMEOUT_MS)), false);
  });

  it("times out batches after the 10 minute limit", () => {
    const createdAt = new Date("2026-05-23T10:00:00.000Z");
    assert.equal(isBatchTimedOut(createdAt, new Date(createdAt.getTime() + BATCH_QUEUE_TIMEOUT_MS + 1)), true);
  });

  it("classifies unfinished batch items for timeout cleanup", () => {
    assert.equal(isUnfinishedBatchItemStatus("queued"), true);
    assert.equal(isUnfinishedBatchItemStatus("creating"), true);
    assert.equal(isUnfinishedBatchItemStatus("pending"), true);
    assert.equal(isUnfinishedBatchItemStatus("running"), true);
    assert.equal(isUnfinishedBatchItemStatus("paused"), true);
    assert.equal(isUnfinishedBatchItemStatus("succeeded"), false);
    assert.equal(isUnfinishedBatchItemStatus("failed"), false);
  });

  it("resolves all timed-out unfinished work as failed", () => {
    const nextStatuses = ["queued", "creating", "pending", "running", "paused"]
      .map((status) => isUnfinishedBatchItemStatus(status) ? "failed" : status);

    assert.equal(resolveImageBatchStatusFromItemStatuses(nextStatuses), "failed");
  });

  it("resolves mixed successful and timed-out work as partial", () => {
    const nextStatuses = ["succeeded", "pending", "running"]
      .map((status) => isUnfinishedBatchItemStatus(status) ? "failed" : status);

    assert.equal(resolveImageBatchStatusFromItemStatuses(nextStatuses), "partial");
  });

  it("uses the configured timeout message", () => {
    assert.equal(
      BATCH_QUEUE_TIMEOUT_ERROR,
      "Batch exceeded the 10 minute queue limit. The unfinished task was cleared as timed out."
    );
  });
});
