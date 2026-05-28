import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createImageJobFromFormData, scheduleImageJob } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";
import { assertRequestContentLength } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertRequestContentLength(request);
    const user = await requireUser();
    const formData = await request.formData();
    const job = await createImageJobFromFormData(user.id, formData);
    await scheduleImageJob(job.jobId);

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
