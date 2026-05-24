"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageJobQueueSnapshotFromDeps = getImageJobQueueSnapshotFromDeps;
function averageNullable(values) {
    const numericValues = values.filter((value) => typeof value === "number" && Number.isFinite(value));
    if (numericValues.length === 0)
        return null;
    return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
}
function getFailureRate(failed, total) {
    if (total <= 0)
        return 0;
    return Math.round((failed / total) * 100);
}
function getProviderHealthStatus(total, failed) {
    if (total === 0)
        return "idle";
    const failureRate = failed / total;
    if (total >= 3 && failureRate >= 0.5)
        return "failing";
    if (failed > 0 || failureRate >= 0.2)
        return "degraded";
    return "healthy";
}
function getFailureReason(error) {
    const message = (error ?? "").toLowerCase();
    if (/api key|apikey|unauthorized|auth|401|permission|forbidden|invalid key/.test(message)) {
        return "API key / auth";
    }
    if (/quota|rate limit|429|billing|credit|insufficient|too many requests/.test(message)) {
        return "Quota / rate limit";
    }
    if (/timeout|timed out|time-out|gateway timeout|gateway time-out|504|524|read timeout/.test(message)) {
        return "Timeout";
    }
    if (/network|fetch failed|econn|socket|dns|connection|connect/.test(message)) {
        return "Network";
    }
    if (/prompt|parameter|param|invalid|unsupported|size|resolution|reference|file|image-to-image/.test(message)) {
        return "Invalid request";
    }
    if (/interrupted|stale|worker|scheduler|heartbeat/.test(message)) {
        return "Interrupted job";
    }
    if (/provider|upstream|service unavailable|openai|nginx|openresty|502|503|500/.test(message)) {
        return "Provider error";
    }
    return "Other";
}
function getFailureSample(error) {
    const normalized = (error ?? "No error message").replace(/\s+/g, " ").trim();
    return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}
function getRecentDiagnostics(recentJobs) {
    const providerMap = new Map();
    const modelMap = new Map();
    const failureMap = new Map();
    for (const job of recentJobs) {
        const providerJobs = providerMap.get(job.provider) ?? [];
        providerJobs.push(job);
        providerMap.set(job.provider, providerJobs);
        const modelKey = `${job.provider}:${job.model}`;
        const modelJobs = modelMap.get(modelKey) ?? [];
        modelJobs.push(job);
        modelMap.set(modelKey, modelJobs);
        if (job.status === "failed") {
            const reason = getFailureReason(job.error);
            const current = failureMap.get(reason);
            const latestAt = job.updatedAt ?? job.createdAt;
            if (current) {
                current.count += 1;
                if (latestAt > current.latestAt) {
                    current.sample = getFailureSample(job.error);
                    current.latestAt = latestAt;
                }
            }
            else {
                failureMap.set(reason, {
                    count: 1,
                    sample: getFailureSample(job.error),
                    latestAt
                });
            }
        }
    }
    const providerHealth = Array.from(providerMap.entries())
        .map(([provider, jobs]) => {
        const succeeded = jobs.filter((job) => job.status === "succeeded").length;
        const failed = jobs.filter((job) => job.status === "failed").length;
        return {
            provider,
            status: getProviderHealthStatus(jobs.length, failed),
            total: jobs.length,
            succeeded,
            failed,
            failureRate: getFailureRate(failed, jobs.length),
            averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs)),
            averageUpstreamMs: averageNullable(jobs.map((job) => job.upstreamMs))
        };
    })
        .sort((left, right) => right.total - left.total || right.failed - left.failed);
    const modelUsage = Array.from(modelMap.entries())
        .map(([key, jobs]) => {
        const [provider, ...modelParts] = key.split(":");
        const model = modelParts.join(":");
        const succeeded = jobs.filter((job) => job.status === "succeeded").length;
        const failed = jobs.filter((job) => job.status === "failed").length;
        return {
            provider,
            model,
            total: jobs.length,
            succeeded,
            failed,
            averageExecutionMs: averageNullable(jobs.map((job) => job.executionMs))
        };
    })
        .sort((left, right) => right.total - left.total || right.failed - left.failed)
        .slice(0, 8);
    const failureReasons = Array.from(failureMap.entries())
        .map(([reason, item]) => ({
        reason,
        count: item.count,
        sample: item.sample,
        latestAt: item.latestAt.toISOString()
    }))
        .sort((left, right) => right.count - left.count || right.latestAt.localeCompare(left.latestAt))
        .slice(0, 8);
    return {
        providerHealth,
        modelUsage,
        failureReasons
    };
}
async function getImageJobQueueSnapshotFromDeps({ workerId, activeCount, recentStatsMs, imageJobClient, ensureInlineImageJobScheduler, isRedisQueueEnabled, checkImageQueueConnection, getImageQueueJobCounts, getInlineConcurrency, getInlineUserConcurrency, getRedisWorkerConcurrency }) {
    ensureInlineImageJobScheduler();
    const recentCutoff = new Date(Date.now() - recentStatsMs);
    const [pending, running, recentFailed, recentSucceeded, recentJobs] = await Promise.all([
        imageJobClient.count({ where: { status: "pending" } }),
        imageJobClient.count({ where: { status: "running" } }),
        imageJobClient.count({ where: { status: "failed", updatedAt: { gte: recentCutoff } } }),
        imageJobClient.count({ where: { status: "succeeded", updatedAt: { gte: recentCutoff } } }),
        imageJobClient.findMany({
            where: {
                status: {
                    in: ["succeeded", "failed"]
                },
                updatedAt: {
                    gte: recentCutoff
                }
            },
            orderBy: {
                updatedAt: "desc"
            },
            take: 200
        })
    ]);
    const concurrency = getInlineConcurrency();
    const diagnostics = getRecentDiagnostics(recentJobs);
    const redisEnabled = isRedisQueueEnabled();
    const queue = await checkImageQueueConnection();
    const bullmq = redisEnabled && queue.ok
        ? await getImageQueueJobCounts().catch((error) => {
            console.warn("[images/jobs] redis queue counts could not be read", {
                cause: error instanceof Error ? error.message : String(error)
            });
            return {
                waiting: 0,
                active: 0,
                delayed: 0,
                failed: 0,
                completed: 0
            };
        })
        : {
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0
        };
    return {
        workerId,
        backend: redisEnabled ? "redis" : "inline",
        queue,
        bullmq,
        concurrency: redisEnabled ? getRedisWorkerConcurrency() : concurrency,
        userConcurrency: redisEnabled ? getRedisWorkerConcurrency() : getInlineUserConcurrency(concurrency),
        active: activeCount,
        queued: pending,
        pending,
        running,
        recentFailed,
        recentSucceeded,
        recent: {
            inspected: recentJobs.length,
            averageQueueWaitMs: averageNullable(recentJobs.map((job) => job.queueWaitMs)),
            averageExecutionMs: averageNullable(recentJobs.map((job) => job.executionMs)),
            averageUpstreamMs: averageNullable(recentJobs.map((job) => job.upstreamMs)),
            averageFileSaveMs: averageNullable(recentJobs.map((job) => job.fileSaveMs))
        },
        ...diagnostics
    };
}
