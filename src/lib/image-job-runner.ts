export function shouldIgnoreImageJobProviderResult(
  job: { status: string; lockedBy: string | null | undefined },
  workerId: string
) {
  return job.status !== "running" || job.lockedBy !== workerId;
}
