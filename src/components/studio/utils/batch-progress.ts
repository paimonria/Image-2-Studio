type BatchProgressItem = {
  status: string;
};

export type BatchProgressSummary = {
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  pausedCount: number;
  finishedCount: number;
  unfinishedCount: number;
  pausedOnly: boolean;
  progressPercent: number;
};

export function getBatchProgressSummary(items: readonly BatchProgressItem[]): BatchProgressSummary {
  let succeededCount = 0;
  let failedCount = 0;
  let pausedCount = 0;

  for (const item of items) {
    if (item.status === "succeeded") {
      succeededCount += 1;
    } else if (item.status === "failed") {
      failedCount += 1;
    } else if (item.status === "paused") {
      pausedCount += 1;
    }
  }

  const totalCount = items.length;
  const finishedCount = succeededCount + failedCount;
  const unfinishedCount = Math.max(0, totalCount - finishedCount);

  return {
    totalCount,
    succeededCount,
    failedCount,
    pausedCount,
    finishedCount,
    unfinishedCount,
    pausedOnly: unfinishedCount > 0 && pausedCount === unfinishedCount,
    progressPercent: totalCount > 0 ? Math.round((finishedCount / totalCount) * 100) : 0
  };
}
