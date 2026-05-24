import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { listImageJobsForUser } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const jobs = await listImageJobsForUser(user.id, {
      scope: url.searchParams.get("scope"),
      limit: url.searchParams.get("limit")
    });

    return NextResponse.json(jobs);
  } catch (error) {
    return handleRouteError(error);
  }
}
