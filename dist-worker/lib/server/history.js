"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeHistoryLimit = normalizeHistoryLimit;
exports.toDbMode = toDbMode;
exports.toImageRecord = toImageRecord;
exports.readHistory = readHistory;
exports.readHistoryPage = readHistoryPage;
exports.appendHistory = appendHistory;
exports.clearHistory = clearHistory;
exports.findRecordsByIds = findRecordsByIds;
exports.deleteHistoryRecords = deleteHistoryRecords;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const db_1 = require("./db");
const errors_1 = require("./errors");
const paths_1 = require("./paths");
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 60;
const MAX_DELETE_IDS = 100;
function encodeHistoryCursor(record) {
    return Buffer.from(JSON.stringify({
        createdAt: record.createdAt.toISOString(),
        id: record.id
    })).toString("base64url");
}
function decodeHistoryCursor(cursor) {
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
            throw new Error("Invalid cursor.");
        }
        const createdAt = new Date(parsed.createdAt);
        if (Number.isNaN(createdAt.getTime())) {
            throw new Error("Invalid cursor.");
        }
        return {
            createdAt,
            id: parsed.id
        };
    }
    catch {
        throw new errors_1.AppError("Invalid history cursor.");
    }
}
function normalizeHistoryLimit(value) {
    if (!value)
        return DEFAULT_HISTORY_LIMIT;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_HISTORY_LIMIT;
    return Math.min(parsed, MAX_HISTORY_LIMIT);
}
function toUiMode(mode) {
    return mode === "image_to_image" ? "image-to-image" : "text-to-image";
}
function toDbMode(mode) {
    return mode === "image-to-image" ? "image_to_image" : "text_to_image";
}
function parseStringList(value) {
    if (!value)
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    }
    catch {
        return [];
    }
}
function parseMeta(value) {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function toImageRecord(record) {
    return {
        id: record.id,
        createdAt: record.createdAt.toISOString(),
        provider: record.provider,
        model: record.model,
        mode: toUiMode(record.mode),
        prompt: record.prompt,
        imageUrl: `/api/images/file/${record.id}`,
        imagePath: record.filePath,
        size: record.size ?? undefined,
        aspectRatio: record.aspectRatio ?? undefined,
        quality: record.quality ?? undefined,
        inputFidelity: record.inputFidelity ?? undefined,
        sourceImageIds: parseStringList(record.sourceImageIds),
        uploadUrls: parseStringList(record.uploadImageIds).map((id) => `/api/images/file/${id}`),
        parentId: record.parentId ?? undefined,
        batchId: record.batchId ?? undefined,
        batchItemId: record.batchItemId ?? undefined,
        projectId: record.projectId ?? undefined,
        tags: parseStringList(record.tags),
        providerMeta: parseMeta(record.providerMeta)
    };
}
async function readHistory(userId) {
    const records = await db_1.prisma.imageRecord.findMany({
        where: { userId },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" }
        ]
    });
    return records.map(toImageRecord);
}
async function readHistoryPage(userId, input) {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_HISTORY_LIMIT, 1), MAX_HISTORY_LIMIT);
    const cursor = input.cursor ? decodeHistoryCursor(input.cursor) : null;
    const batchId = input.batchId?.trim();
    const projectId = input.projectId?.trim();
    const tag = input.tag?.trim();
    const records = await db_1.prisma.imageRecord.findMany({
        where: {
            userId,
            ...(batchId ? { batchId } : {}),
            ...(projectId ? { projectId } : {}),
            ...(tag ? { tags: { contains: `"${tag}"` } } : {}),
            ...(cursor
                ? {
                    OR: [
                        { createdAt: { lt: cursor.createdAt } },
                        {
                            createdAt: cursor.createdAt,
                            id: { lt: cursor.id }
                        }
                    ]
                }
                : {})
        },
        orderBy: [
            { createdAt: "desc" },
            { id: "desc" }
        ],
        take: limit + 1
    });
    const pageRecords = records.slice(0, limit);
    return {
        records: pageRecords.map(toImageRecord),
        nextCursor: records.length > limit && pageRecords.length > 0
            ? encodeHistoryCursor(pageRecords[pageRecords.length - 1])
            : undefined
    };
}
async function appendHistory(input) {
    const record = await db_1.prisma.imageRecord.create({
        data: {
            id: input.id,
            userId: input.userId,
            provider: input.provider,
            model: input.model,
            mode: toDbMode(input.mode),
            prompt: input.prompt,
            filePath: input.filePath,
            mimeType: input.mimeType,
            size: input.size,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            inputFidelity: input.inputFidelity,
            sourceImageIds: JSON.stringify(input.sourceImageIds),
            uploadImageIds: JSON.stringify(input.uploadImageIds),
            parentId: input.parentId,
            batchId: input.batchId,
            batchItemId: input.batchItemId,
            projectId: input.projectId,
            tags: JSON.stringify(input.tags ?? []),
            providerMeta: input.providerMeta ? JSON.stringify(input.providerMeta) : undefined
        }
    });
    return toImageRecord(record);
}
async function clearHistory(userId) {
    const records = await db_1.prisma.imageRecord.findMany({ where: { userId } });
    await db_1.prisma.imageRecord.deleteMany({ where: { userId } });
    await cleanupGeneratedHistoryFiles(userId, records);
}
async function findRecordsByIds(userId, ids) {
    if (ids.length === 0)
        return [];
    return db_1.prisma.imageRecord.findMany({
        where: {
            userId,
            id: { in: ids }
        }
    });
}
function normalizeDeleteIds(ids) {
    if (!Array.isArray(ids)) {
        throw new errors_1.AppError("Choose at least one image to delete.");
    }
    const normalized = Array.from(new Set(ids
        .map((id) => typeof id === "string" ? id.trim() : "")
        .filter(Boolean)));
    if (normalized.length === 0) {
        throw new errors_1.AppError("Choose at least one image to delete.");
    }
    if (normalized.length > MAX_DELETE_IDS) {
        throw new errors_1.AppError(`Delete at most ${MAX_DELETE_IDS} images at a time.`);
    }
    return normalized;
}
function isInsideDirectory(baseDir, filePath) {
    const relative = node_path_1.default.relative(baseDir, filePath);
    return Boolean(relative) && !relative.startsWith("..") && !node_path_1.default.isAbsolute(relative);
}
async function cleanupGeneratedHistoryFiles(userId, records) {
    const userGeneratedDir = node_path_1.default.resolve(paths_1.STORAGE_GENERATED_DIR, userId);
    const filePaths = Array.from(new Set(records.map((record) => record.filePath).filter(Boolean)));
    if (filePaths.length === 0)
        return;
    await db_1.prisma.storedImage.deleteMany({
        where: {
            userId,
            kind: "generated",
            filePath: { in: filePaths }
        }
    });
    await Promise.all(filePaths.map(async (filePath) => {
        const resolved = node_path_1.default.resolve(filePath);
        if (!isInsideDirectory(userGeneratedDir, resolved))
            return;
        try {
            await node_fs_1.promises.rm(resolved, { force: true });
        }
        catch (error) {
            console.warn("[images/history] failed to remove generated file", {
                filePath: resolved,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }));
}
async function deleteHistoryRecords(userId, ids) {
    const normalizedIds = normalizeDeleteIds(ids);
    const records = await db_1.prisma.imageRecord.findMany({
        where: {
            userId,
            id: { in: normalizedIds }
        }
    });
    if (records.length === 0) {
        return [];
    }
    await db_1.prisma.imageRecord.deleteMany({
        where: {
            userId,
            id: { in: records.map((record) => record.id) }
        }
    });
    await cleanupGeneratedHistoryFiles(userId, records);
    return records.map((record) => record.id);
}
