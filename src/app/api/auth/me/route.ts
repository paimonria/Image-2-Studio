import { NextResponse } from "next/server";
import { ensureInitialAdmin, getCurrentUser, toPublicUser } from "@/lib/server/auth";
import { readAppSettings } from "@/lib/server/provider-config";

export const runtime = "nodejs";

export async function GET() {
  await ensureInitialAdmin();
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    readAppSettings()
  ]);

  return NextResponse.json({
    user: user ? toPublicUser(user) : null,
    registrationOpen: settings.registrationOpen
  });
}
