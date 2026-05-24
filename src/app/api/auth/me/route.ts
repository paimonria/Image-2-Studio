import { NextResponse } from "next/server";
import { ensureInitialAdmin, getCurrentUser, toPublicUser } from "@/lib/server/auth";
import { getAppSettings } from "@/lib/server/provider-config";

export const runtime = "nodejs";

export async function GET() {
  await ensureInitialAdmin();
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getAppSettings()
  ]);

  return NextResponse.json({
    user: user ? toPublicUser(user) : null,
    registrationOpen: settings.registrationOpen
  });
}
