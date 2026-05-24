import { AppError } from "./errors";
import { getAppSettings } from "./provider-config";
import { prisma } from "./db";

const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function getBeijingDateKey(date = new Date()) {
  const parts = BEIJING_DATE_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export async function reservePlatformQuota(userId: string) {
  const settings = await getAppSettings();
  const date = getBeijingDateKey();

  const usage = await prisma.usageDaily.upsert({
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

  const reserved = await prisma.usageDaily.updateMany({
    where: {
      id: usage.id,
      platformUses: { lt: settings.dailyPlatformQuota }
    },
    data: { platformUses: { increment: 1 } }
  });

  if (reserved.count === 0) {
    throw new AppError("Daily platform quota reached.", 429);
  }

  return date;
}

export async function refundPlatformQuota(userId: string, date: string | undefined) {
  if (!date) return;

  await prisma.usageDaily.updateMany({
    where: {
      userId,
      date,
      platformUses: { gt: 0 }
    },
    data: { platformUses: { decrement: 1 } }
  });
}
