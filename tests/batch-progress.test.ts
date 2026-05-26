import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBatchProgressSummary } from "../src/components/studio/utils/batch-progress";

describe("batch progress summary", () => {
  it("returns an empty summary for empty batches", () => {
    assert.deepEqual(getBatchProgressSummary([]), {
      totalCount: 0,
      succeededCount: 0,
      failedCount: 0,
      pausedCount: 0,
      finishedCount: 0,
      unfinishedCount: 0,
      pausedOnly: false,
      progressPercent: 0
    });
  });

  it("counts finished and unfinished batch items", () => {
    assert.deepEqual(getBatchProgressSummary([
      { status: "succeeded" },
      { status: "failed" },
      { status: "running" },
      { status: "queued" }
    ]), {
      totalCount: 4,
      succeededCount: 1,
      failedCount: 1,
      pausedCount: 0,
      finishedCount: 2,
      unfinishedCount: 2,
      pausedOnly: false,
      progressPercent: 50
    });
  });

  it("marks a batch as paused-only when every unfinished item is paused", () => {
    assert.deepEqual(getBatchProgressSummary([
      { status: "succeeded" },
      { status: "paused" },
      { status: "paused" }
    ]), {
      totalCount: 3,
      succeededCount: 1,
      failedCount: 0,
      pausedCount: 2,
      finishedCount: 1,
      unfinishedCount: 2,
      pausedOnly: true,
      progressPercent: 33
    });
  });

  it("does not treat finished-only batches as paused-only", () => {
    assert.deepEqual(getBatchProgressSummary([
      { status: "succeeded" },
      { status: "failed" }
    ]), {
      totalCount: 2,
      succeededCount: 1,
      failedCount: 1,
      pausedCount: 0,
      finishedCount: 2,
      unfinishedCount: 0,
      pausedOnly: false,
      progressPercent: 100
    });
  });
});
