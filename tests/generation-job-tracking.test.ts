import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageJobResponse } from "../src/lib/types";
import {
  getPolledImageJobDecision,
  getPollImageJobPausedMessage,
  getPollImageJobStillRunningMessage,
  getTrackImageJobDecision,
  getTrackImageJobPausedMessage
} from "../src/components/studio/utils/generation-job-tracking";

function createJob(overrides: Partial<ImageJobResponse>): ImageJobResponse {
  return {
    id: "job-1",
    status: "pending",
    provider: "openai",
    model: "gpt-image-1",
    mode: "text-to-image",
    createdAt: "2026-05-26T00:00:00.000Z",
    ...overrides
  };
}

const messages = {
  generationFailed: "Generation failed.",
  paused: "Paused."
};

describe("generation job tracking decisions", () => {
  it("opens batch detail and polls only active batch jobs", () => {
    assert.deepEqual(getTrackImageJobDecision(createJob({ batchId: "batch-1", status: "running" }), messages), {
      kind: "batch",
      batchId: "batch-1",
      shouldPoll: true
    });

    assert.deepEqual(getTrackImageJobDecision(createJob({ batchId: "batch-1", status: "succeeded" }), messages), {
      kind: "batch",
      batchId: "batch-1",
      shouldPoll: false
    });
  });

  it("selects completed standalone job results without polling", () => {
    assert.deepEqual(getTrackImageJobDecision(createJob({ status: "succeeded", resultId: "record-1" }), messages), {
      kind: "select-result",
      resultId: "record-1"
    });
  });

  it("shows stable error messages for failed and paused jobs", () => {
    assert.deepEqual(getTrackImageJobDecision(createJob({ status: "failed", error: "Provider failed." }), messages), {
      kind: "error",
      message: "Provider failed."
    });
    assert.deepEqual(getTrackImageJobDecision(createJob({ status: "failed" }), messages), {
      kind: "error",
      message: "Generation failed."
    });
    assert.deepEqual(getTrackImageJobDecision(createJob({ status: "paused" }), messages), {
      kind: "error",
      message: "Paused."
    });
  });

  it("polls standalone pending or running jobs", () => {
    assert.deepEqual(getTrackImageJobDecision(createJob({ id: "job-2", status: "pending" }), messages), {
      kind: "poll",
      jobId: "job-2"
    });
    assert.deepEqual(getTrackImageJobDecision(createJob({ id: "job-3", status: "running" }), messages), {
      kind: "poll",
      jobId: "job-3"
    });
  });

  it("keeps paused tracking messages localized", () => {
    assert.equal(getTrackImageJobPausedMessage("zh"), "任务已暂停，请先恢复任务。");
    assert.equal(getTrackImageJobPausedMessage("en"), "This job is paused. Resume it before tracking.");
  });

  it("continues polling when a job is absent or unfinished", () => {
    assert.deepEqual(getPolledImageJobDecision(null, messages), { kind: "continue" });
    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "running" }), messages), { kind: "continue" });
    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "pending" }), messages), { kind: "continue" });
  });

  it("returns completed polled jobs only when result ids are present", () => {
    const succeeded = createJob({ status: "succeeded", resultId: "record-1" });
    assert.deepEqual(getPolledImageJobDecision(succeeded, messages), {
      kind: "succeeded",
      job: succeeded
    });

    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "succeeded" }), messages), {
      kind: "error",
      message: "Generation failed."
    });
  });

  it("converts failed and paused polled jobs to user-facing errors", () => {
    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "failed", error: "Provider failed." }), messages), {
      kind: "error",
      message: "Provider failed."
    });
    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "failed" }), messages), {
      kind: "error",
      message: "Generation failed."
    });
    assert.deepEqual(getPolledImageJobDecision(createJob({ status: "paused" }), messages), {
      kind: "error",
      message: "Paused."
    });
  });

  it("keeps image polling status messages localized", () => {
    assert.equal(getPollImageJobPausedMessage("zh"), "任务已暂停，恢复后会继续排队。");
    assert.equal(getPollImageJobPausedMessage("en"), "The job is paused. Resume it to continue.");
    assert.equal(getPollImageJobStillRunningMessage("zh"), "生成任务仍在运行，请稍后刷新历史记录查看结果。");
    assert.equal(
      getPollImageJobStillRunningMessage("en"),
      "The generation job is still running. Refresh history later to check the result."
    );
  });
});
