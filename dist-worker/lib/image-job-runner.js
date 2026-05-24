"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldIgnoreImageJobProviderResult = shouldIgnoreImageJobProviderResult;
function shouldIgnoreImageJobProviderResult(job, workerId) {
    return job.status !== "running" || job.lockedBy !== workerId;
}
