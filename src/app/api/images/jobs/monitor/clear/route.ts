import { NextResponse } from "next/server";
import { requireUser, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const clearedAt = new Date();
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { jobMonitorClearedAt: clearedAt }
    });

    return NextResponse.json({
      jobMonitorClearedAt: clearedAt.toISOString(),
      user: toPublicUser(updatedUser)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
