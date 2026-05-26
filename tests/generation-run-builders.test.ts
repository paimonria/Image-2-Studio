import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBatchGenerationItemDefaults,
  buildOptimisticImageJob,
  buildPendingGeneration,
  buildRunningBatchRun,
  buildRunningSingleRun,
  canUseServerBatchRetry,
  getBatchPollingDeadline,
  getBatchRetryItemIds,
  getCompletedBatchRunSummary,
  getGenerationReferenceCount,
  getLastSuccessfulBatchResultId,
  getRetryableBatchItems,
  hasBatchQueueTimeout
} from "../src/components/studio/utils/generation-run-builders";

function createFile(name: string) {
  return new File(["image-bytes"], name, { type: "image/png" });
}

describe("generation run builders", () => {
  it("counts uploaded and history references together", () => {
    assert.equal(
      getGenerationReferenceCount({
        files: [createFile("one.png"), createFile("two.png")],
        sourceImageIds: ["history-1"]
      }),
      3
    );
  });

  it("builds pending generation display state without mutating source ids", () => {
    const sourceImageIds = ["history-1"];
    const pending = buildPendingGeneration({
      provider: "openai",
      model: "gpt-image-2",
      mode: "image-to-image",
      prompt: "Make it brighter",
      size: "1024x1024",
      aspectRatio: "1:1",
      quality: "high",
      sourceImageIds,
      files: [createFile("source.png")],
      startedAt: 1779793000000
    });

    sourceImageIds.push("history-2");

    assert.deepEqual(pending, {
      provider: "openai",
      model: "gpt-image-2",
      mode: "image-to-image",
      prompt: "Make it brighter",
      size: "1024x1024",
      aspectRatio: "1:1",
      quality: "high",
      sourceImageIds: ["history-1"],
      fileNames: ["source.png"],
      startedAt: 1779793000000
    });
  });

  it("builds running single run metadata", () => {
    assert.deepEqual(buildRunningSingleRun({
      runId: "single:job-1:1779793000000",
      jobId: "job-1",
      startedAt: 1779793000000,
      prompt: "A product photo"
    }), {
      id: "single:job-1:1779793000000",
      kind: "single",
      status: "running",
      startedAt: 1779793000000,
      background: false,
      jobId: "job-1",
      prompt: "A product photo"
    });
  });

  it("builds running batch run metadata", () => {
    assert.deepEqual(buildRunningBatchRun({
      runId: "batch:batch-1:1779793000000",
      batchId: "batch-1",
      createdAt: "2026-05-26T12:00:00.000Z",
      totalCount: 3,
      now: 1779793000000
    }), {
      id: "batch:batch-1:1779793000000",
      kind: "batch",
      status: "running",
      startedAt: Date.UTC(2026, 4, 26, 12, 0, 0),
      background: false,
      batchId: "batch-1",
      totalCount: 3
    });
  });

  it("falls back to the current time when batch creation time is invalid", () => {
    assert.equal(buildRunningBatchRun({
      runId: "batch:batch-1:1779793000000",
      batchId: "batch-1",
      createdAt: "not-a-date",
      totalCount: 3,
      now: 1779793000000
    }).startedAt, 1779793000000);
  });

  it("extends batch polling deadlines from valid batch creation times", () => {
    assert.equal(getBatchPollingDeadline({
      createdAt: "2026-05-26T12:00:00.000Z",
      currentDeadline: 123,
      timeoutMs: 600_000,
      pollIntervalMs: 2_000
    }), Date.UTC(2026, 4, 26, 12, 0, 0) + 602_000);
  });

  it("keeps the current batch polling deadline when creation time is invalid", () => {
    assert.equal(getBatchPollingDeadline({
      createdAt: "not-a-date",
      currentDeadline: 1779793000000,
      timeoutMs: 600_000,
      pollIntervalMs: 2_000
    }), 1779793000000);
  });

  it("applies batch item display defaults without mutating source items", () => {
    const items = [{
      id: "item-1",
      size: "",
      aspectRatio: "",
      quality: ""
    }];

    assert.deepEqual(applyBatchGenerationItemDefaults(items, {
      size: "1024x1024",
      aspectRatio: "1:1",
      quality: "high"
    }), [{
      id: "item-1",
      size: "1024x1024",
      aspectRatio: "1:1",
      quality: "high"
    }]);
    assert.deepEqual(items, [{
      id: "item-1",
      size: "",
      aspectRatio: "",
      quality: ""
    }]);
  });

  it("builds optimistic image job state for immediate monitor feedback", () => {
    assert.deepEqual(buildOptimisticImageJob({
      jobId: "job-1",
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "A product photo",
      createdAt: Date.UTC(2026, 4, 26, 12, 0, 0)
    }), {
      id: "job-1",
      status: "pending",
      provider: "openai",
      model: "gpt-image-2",
      mode: "text-to-image",
      prompt: "A product photo",
      createdAt: "2026-05-26T12:00:00.000Z"
    });
  });

  it("detects batch queue timeout errors from item messages", () => {
    assert.equal(hasBatchQueueTimeout([
      { status: "succeeded" },
      { status: "failed", error: "Batch exceeded the 10 minute queue limit. The unfinished task was cleared." }
    ]), true);

    assert.equal(hasBatchQueueTimeout([
      { status: "failed", error: "Provider failed." }
    ]), false);
  });

  it("returns the newest successful batch result id", () => {
    assert.equal(getLastSuccessfulBatchResultId([
      { status: "succeeded", resultId: "older-record" },
      { status: "failed" },
      { status: "succeeded", resultId: "newer-record" }
    ]), "newer-record");

    assert.equal(getLastSuccessfulBatchResultId([
      { status: "failed" }
    ]), undefined);
  });

  it("summarizes completed batch run status and user-facing errors", () => {
    const messages = {
      batchTimedOut: "Batch timed out.",
      generationFailed: "Generation failed."
    };

    assert.deepEqual(getCompletedBatchRunSummary([
      { status: "succeeded" },
      { status: "succeeded" }
    ], messages), {
      failed: false,
      timedOut: false,
      status: "succeeded",
      error: undefined
    });

    assert.deepEqual(getCompletedBatchRunSummary([
      { status: "failed", error: "Provider failed." }
    ], messages), {
      failed: true,
      timedOut: false,
      status: "failed",
      error: "Generation failed."
    });

    assert.deepEqual(getCompletedBatchRunSummary([
      { status: "failed", error: "Batch exceeded the 10 minute queue limit." }
    ], messages), {
      failed: true,
      timedOut: true,
      status: "failed",
      error: "Batch timed out."
    });
  });

  it("selects retryable batch items and preserves their order", () => {
    const retryableItems = getRetryableBatchItems([
      { id: "queued", status: "queued" },
      { id: "failed-1", status: "failed" },
      { id: "paused", status: "paused" },
      { id: "failed-2", status: "failed" }
    ]);

    assert.deepEqual(retryableItems.map((item) => item.id), ["failed-1", "failed-2"]);
  });

  it("uses server batch retry only when every retry item belongs to a batch", () => {
    assert.equal(canUseServerBatchRetry("batch-1", [
      { id: "item-1", status: "failed", batchId: "batch-1" },
      { id: "item-2", status: "failed", batchId: "batch-1" }
    ]), true);

    assert.equal(canUseServerBatchRetry("", [
      { id: "item-1", status: "failed", batchId: "batch-1" }
    ]), false);

    assert.equal(canUseServerBatchRetry("batch-1", [
      { id: "item-1", status: "failed" }
    ]), false);

    assert.equal(canUseServerBatchRetry("batch-1", []), false);
  });

  it("builds retry item id lists for server requests", () => {
    assert.deepEqual(getBatchRetryItemIds([
      { id: "item-1", status: "failed", batchId: "batch-1" },
      { id: "item-2", status: "failed", batchId: "batch-1" }
    ]), ["item-1", "item-2"]);
  });
});
