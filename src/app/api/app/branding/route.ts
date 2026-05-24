import { NextResponse } from "next/server";
import { getPublicBranding, readAppSettings } from "@/lib/server/provider-config";

export const runtime = "nodejs";

export async function GET() {
  const settings = await readAppSettings();

  return NextResponse.json(getPublicBranding(settings));
}
