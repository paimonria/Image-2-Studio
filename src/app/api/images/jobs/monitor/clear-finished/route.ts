import { NextResponse } from "next/server";
import { requireUser, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { handleRouteError } from "@/lib/server/responses";
import { buildVisibleFinishedJobWhere } from "@/lib/job-monitor";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const clearedAt = new Date();
    const hiddenCount = await prisma.imageJob.count({
      where: buildVisibleFinishedJobWhere(user.id, user.jobMonitorFinishedClearedAt)
    });
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { jobMonitorFinishedClearedAt: clearedAt }
    });

    return NextResponse.json({
      hiddenCount,
      jobMonitorFinishedClearedAt: clearedAt.toISOString(),
      user: toPublicUser(updatedUser)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
