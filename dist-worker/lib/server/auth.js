"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE = void 0;
exports.toPublicUser = toPublicUser;
exports.normalizeEmail = normalizeEmail;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.createSession = createSession;
exports.destroySession = destroySession;
exports.getCurrentUser = getCurrentUser;
exports.requireUser = requireUser;
exports.requireAdmin = requireAdmin;
exports.ensureInitialAdmin = ensureInitialAdmin;
const node_crypto_1 = require("node:crypto");
const headers_1 = require("next/headers");
const bcryptjs_1 = require("bcryptjs");
const db_1 = require("./db");
const crypto_1 = require("./crypto");
const errors_1 = require("./errors");
exports.SESSION_COOKIE = "image2_session";
const SESSION_DAYS = 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
function toPublicUser(user) {
    const jobMonitorClearedAt = user.jobMonitorClearedAt instanceof Date
        ? user.jobMonitorClearedAt.toISOString()
        : user.jobMonitorClearedAt ?? null;
    const jobMonitorFinishedClearedAt = user.jobMonitorFinishedClearedAt instanceof Date
        ? user.jobMonitorFinishedClearedAt.toISOString()
        : user.jobMonitorFinishedClearedAt ?? null;
    return {
        id: user.id,
        email: user.email,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        disabled: user.disabled,
        jobMonitorClearedAt,
        jobMonitorFinishedClearedAt
    };
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
async function hashPassword(password) {
    return (0, bcryptjs_1.hash)(password, 12);
}
async function verifyPassword(password, passwordHash) {
    return (0, bcryptjs_1.compare)(password, passwordHash);
}
function getSessionExpiry() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);
    return expiresAt;
}
function shouldUseSecureSessionCookie() {
    const value = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
    if (value === "false" || value === "0" || value === "no") {
        return false;
    }
    if (value === "true" || value === "1" || value === "yes") {
        return true;
    }
    return process.env.NODE_ENV === "production";
}
async function createSession(userId) {
    const token = (0, node_crypto_1.randomBytes)(32).toString("base64url");
    const expiresAt = getSessionExpiry();
    await db_1.prisma.session.create({
        data: {
            userId,
            tokenHash: (0, crypto_1.sha256)(token),
            expiresAt
        }
    });
    const cookieStore = await (0, headers_1.cookies)();
    cookieStore.set(exports.SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureSessionCookie(),
        path: "/",
        expires: expiresAt
    });
}
async function destroySession() {
    const cookieStore = await (0, headers_1.cookies)();
    const token = cookieStore.get(exports.SESSION_COOKIE)?.value;
    if (token) {
        await db_1.prisma.session.deleteMany({ where: { tokenHash: (0, crypto_1.sha256)(token) } });
    }
    cookieStore.set(exports.SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: shouldUseSecureSessionCookie(),
        path: "/",
        maxAge: 0
    });
}
async function getCurrentUser() {
    const cookieStore = await (0, headers_1.cookies)();
    const token = cookieStore.get(exports.SESSION_COOKIE)?.value;
    if (!token)
        return null;
    const session = await db_1.prisma.session.findUnique({
        where: { tokenHash: (0, crypto_1.sha256)(token) },
        include: { user: true }
    });
    if (!session || session.expiresAt <= new Date() || session.user.disabled) {
        return null;
    }
    if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
        await db_1.prisma.session.update({
            where: { id: session.id },
            data: { lastSeenAt: new Date() }
        });
    }
    return session.user;
}
async function requireUser() {
    const user = await getCurrentUser();
    if (!user) {
        throw new errors_1.AppError("Authentication required.", 401);
    }
    return user;
}
async function requireAdmin() {
    const user = await requireUser();
    if (user.role !== "ADMIN") {
        throw new errors_1.AppError("Admin access required.", 403);
    }
    return user;
}
async function ensureInitialAdmin() {
    const email = normalizeEmail(process.env.INITIAL_ADMIN_EMAIL ?? "");
    const password = process.env.INITIAL_ADMIN_PASSWORD ?? "";
    if (!email || !password)
        return;
    const existingAdmin = await db_1.prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (existingAdmin)
        return;
    await db_1.prisma.user.create({
        data: {
            email,
            passwordHash: await hashPassword(password),
            role: "ADMIN"
        }
    });
}
