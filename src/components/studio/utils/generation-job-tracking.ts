import type { ImageJobResponse } from "../../../lib/types";
import type { Locale } from "./copy";

type TrackImageJobMessages = {
  generationFailed: string;
  paused: string;
};

type PollImageJobMessages = {
  generationFailed: string;
  paused: string;
};

export type TrackImageJobDecision =
  | { kind: "batch"; batchId: string; shouldPoll: boolean }
  | { kind: "select-result"; resultId: string }
  | { kind: "error"; message: string }
  | { kind: "poll"; jobId: string };

export type PolledImageJobDecision =
  | { kind: "continue" }
  | { kind: "succeeded"; job: ImageJobResponse }
  | { kind: "error"; message: string };

export function getTrackImageJobPausedMessage(locale: Locale) {
  return locale === "zh"
    ? "任务已暂停，请先恢复任务。"
    : "This job is paused. Resume it before tracking.";
}

export function getPollImageJobPausedMessage(locale: Locale) {
  return locale === "zh"
    ? "任务已暂停，恢复后会继续排队。"
    : "The job is paused. Resume it to continue.";
}

export function getPollImageJobStillRunningMessage(locale: Locale) {
  return locale === "zh"
    ? "生成任务仍在运行，请稍后刷新历史记录查看结果。"
    : "The generation job is still running. Refresh history later to check the result.";
}

export function getTrackImageJobDecision(
  job: Pick<ImageJobResponse, "id" | "status" | "batchId" | "resultId" | "error">,
  messages: TrackImageJobMessages
): TrackImageJobDecision {
  if (job.batchId) {
    return {
      kind: "batch",
      batchId: job.batchId,
      shouldPoll: job.status === "pending" || job.status === "running"
    };
  }

  if (job.status === "succeeded" && job.resultId) {
    return { kind: "select-result", resultId: job.resultId };
  }

  if (job.status === "failed") {
    return { kind: "error", message: job.error || messages.generationFailed };
  }

  if (job.status === "paused") {
    return { kind: "error", message: messages.paused };
  }

  return { kind: "poll", jobId: job.id };
}

export function getPolledImageJobDecision(
  job: ImageJobResponse | null,
  messages: PollImageJobMessages
): PolledImageJobDecision {
  if (!job) {
    return { kind: "continue" };
  }

  if (job.status === "succeeded") {
    if (!job.resultId) {
      return { kind: "error", message: messages.generationFailed };
    }

    return { kind: "succeeded", job };
  }

  if (job.status === "failed") {
    return { kind: "error", message: job.error || messages.generationFailed };
  }

  if (job.status === "paused") {
    return { kind: "error", message: messages.paused };
  }

  return { kind: "continue" };
}
