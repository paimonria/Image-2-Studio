"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
exports.sha256 = sha256;
exports.safeEqual = safeEqual;
const node_crypto_1 = require("node:crypto");
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
function getAppSecret() {
    const secret = process.env.APP_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error("APP_SECRET must be set to at least 32 characters.");
    }
    return (0, node_crypto_1.createHash)("sha256").update(secret).digest();
}
function encryptSecret(value) {
    const key = getAppSecret();
    const iv = (0, node_crypto_1.randomBytes)(IV_BYTES);
    const cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", key.subarray(0, KEY_BYTES), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}
function decryptSecret(value) {
    if (!value)
        return "";
    const key = getAppSecret();
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = (0, node_crypto_1.createDecipheriv)("aes-256-gcm", key.subarray(0, KEY_BYTES), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
function safeEqual(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && (0, node_crypto_1.timingSafeEqual)(left, right);
}
