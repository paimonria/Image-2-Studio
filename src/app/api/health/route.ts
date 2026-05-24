import { NextResponse } from "next/server";
import { getImageJobQueueSnapshot } from "@/lib/server/image-jobs";
import { getAppVersion } from "@/lib/version";

export const runtime = "nodejs";

export async function GET() {
  const jobQueue = await getImageJobQueueSnapshot();

  return NextResponse.json({
    status: "ok",
    service: "image-2-studio",
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
    jobQueue
  });
}
