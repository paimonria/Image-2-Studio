import { NextResponse } from "next/server";
import { hashPassword, requireAdmin, toPublicUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/db";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as {
      disabled?: boolean;
      password?: string;
      role?: "ADMIN" | "USER";
    };

    const data: {
      disabled?: boolean;
      passwordHash?: string;
      role?: "ADMIN" | "USER";
    } = {};

    if (typeof body.disabled === "boolean") {
      data.disabled = id === admin.id ? false : body.disabled;
    }

    if (typeof body.password === "string" && body.password.length >= 8) {
      data.passwordHash = await hashPassword(body.password);
    }

    if (body.role === "ADMIN" || body.role === "USER") {
      data.role = body.role;
    }

    const user = await prisma.user.update({
      where: { id },
      data
    });

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    return handleRouteError(error);
  }
}
