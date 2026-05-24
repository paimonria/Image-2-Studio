"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAllowedImageFile = assertAllowedImageFile;
exports.mimeToExtension = mimeToExtension;
exports.extensionToMime = extensionToMime;
exports.saveGeneratedImage = saveGeneratedImage;
exports.saveUploadedFile = saveUploadedFile;
exports.readStoredImageForUser = readStoredImageForUser;
exports.readStoredImageMetaForUser = readStoredImageMetaForUser;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const errors_1 = require("./errors");
const paths_1 = require("./paths");
const db_1 = require("./db");
const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
function assertAllowedImageFile(file) {
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
        throw new errors_1.AppError("Only PNG, JPEG, and WebP images are supported.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new errors_1.AppError("Each reference image must be 10MB or smaller.");
    }
}
function mimeToExtension(mimeType) {
    if (mimeType === "image/jpeg")
        return "jpg";
    if (mimeType === "image/webp")
        return "webp";
    return "png";
}
function extensionToMime(filePath) {
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg")
        return "image/jpeg";
    if (ext === ".webp")
        return "image/webp";
    return "image/png";
}
async function ensureUserStorageDir(userId, kind) {
    const baseDir = kind === "generated" ? paths_1.STORAGE_GENERATED_DIR : paths_1.STORAGE_UPLOADS_DIR;
    const dir = node_path_1.default.join(baseDir, userId);
    await node_fs_1.promises.mkdir(dir, { recursive: true });
    return dir;
}
async function createStoredImage(userId, kind, buffer, mimeType) {
    const dir = await ensureUserStorageDir(userId, kind);
    const ext = mimeToExtension(mimeType);
    const filename = `${(0, node_crypto_1.randomUUID)()}.${ext}`;
    const filePath = node_path_1.default.join(dir, filename);
    await node_fs_1.promises.writeFile(filePath, buffer);
    const record = await db_1.prisma.storedImage.create({
        data: {
            userId,
            kind,
            filename,
            filePath,
            mimeType
        }
    });
    return {
        id: record.id,
        filename,
        filePath,
        imageUrl: `/api/images/file/${record.id}`,
        mimeType,
        buffer
    };
}
async function saveGeneratedImage(userId, buffer, mimeType) {
    return createStoredImage(userId, "generated", buffer, mimeType);
}
async function saveUploadedFile(userId, file) {
    assertAllowedImageFile(file);
    const mimeType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());
    return createStoredImage(userId, "upload", buffer, mimeType);
}
async function readStoredImageForUser(userId, imageId) {
    const image = await readStoredImageMetaForUser(userId, imageId);
    const buffer = await node_fs_1.promises.readFile(image.filePath);
    return {
        ...image,
        buffer
    };
}
async function readStoredImageMetaForUser(userId, imageId) {
    const record = await db_1.prisma.storedImage.findFirst({
        where: {
            id: imageId,
            userId
        }
    });
    if (!record) {
        const historyRecord = await db_1.prisma.imageRecord.findFirst({
            where: {
                id: imageId,
                userId
            }
        });
        if (!historyRecord) {
            throw new errors_1.AppError("Image not found.", 404);
        }
        return {
            id: historyRecord.id,
            filename: node_path_1.default.basename(historyRecord.filePath),
            filePath: historyRecord.filePath,
            imageUrl: `/api/images/file/${historyRecord.id}`,
            mimeType: historyRecord.mimeType || extensionToMime(historyRecord.filePath)
        };
    }
    return {
        id: record.id,
        filename: record.filename,
        filePath: record.filePath,
        imageUrl: `/api/images/file/${record.id}`,
        mimeType: record.mimeType || extensionToMime(record.filePath)
    };
}
