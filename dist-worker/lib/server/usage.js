"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBeijingDateKey = getBeijingDateKey;
exports.reservePlatformQuota = reservePlatformQuota;
exports.refundPlatformQuota = refundPlatformQuota;
const errors_1 = require("./errors");
const provider_config_1 = require("./provider-config");
const db_1 = require("./db");
const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});
function getBeijingDateKey(date = new Date()) {
    const parts = BEIJING_DATE_FORMATTER.formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
async function reservePlatformQuota(userId) {
    const settings = await (0, provider_config_1.getAppSettings)();
    const date = getBeijingDateKey();
    const usage = await db_1.prisma.usageDaily.upsert({
        where: {
            userId_date: {
                userId,
                date
            }
        },
        update: {},
        create: {
            userId,
            date
        }
    });
    const reserved = await db_1.prisma.usageDaily.updateMany({
        where: {
            id: usage.id,
            platformUses: { lt: settings.dailyPlatformQuota }
        },
        data: { platformUses: { increment: 1 } }
    });
    if (reserved.count === 0) {
        throw new errors_1.AppError("Daily platform quota reached.", 429);
    }
    return date;
}
async function refundPlatformQuota(userId, date) {
    if (!date)
        return;
    await db_1.prisma.usageDaily.updateMany({
        where: {
            userId,
            date,
            platformUses: { gt: 0 }
        },
        data: { platformUses: { decrement: 1 } }
    });
}
