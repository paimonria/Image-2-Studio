"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageWorkerSchemaWaitConfig = getImageWorkerSchemaWaitConfig;
exports.isMissingImageJobTableError = isMissingImageJobTableError;
const DEFAULT_SCHEMA_WAIT_ATTEMPTS = 12;
const DEFAULT_SCHEMA_WAIT_DELAY_MS = 5000;
function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function getImageWorkerSchemaWaitConfig(env = process.env) {
    const attempts = parsePositiveInteger(env.DB_MIGRATE_ATTEMPTS, DEFAULT_SCHEMA_WAIT_ATTEMPTS);
    const retrySeconds = parsePositiveInteger(env.DB_MIGRATE_RETRY_SECONDS, DEFAULT_SCHEMA_WAIT_DELAY_MS / 1000);
    return {
        attempts,
        delayMs: retrySeconds * 1000
    };
}
function isMissingImageJobTableError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return /P2021/.test(message)
        || /no such table.*ImageJob/i.test(message)
        || /relation .*ImageJob.* does not exist/i.test(message)
        || /table [`"']?(public\.)?ImageJob[`"']? does not exist/i.test(message)
        || /The table [`"'][^`"']*ImageJob[`"'] does not exist/i.test(message);
}
