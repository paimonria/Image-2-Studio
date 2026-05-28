import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { createAndScheduleImageBatchFromFormData } from "@/lib/server/image-jobs";
import { handleRouteError } from "@/lib/server/responses";
import { assertRequestContentLength } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertRequestContentLength(request);
    const user = await requireUser();
    const formData = await request.formData();
    const batch = await createAndScheduleImageBatchFromFormData(user.id, formData);

    return NextResponse.json(batch, { status: 202 });
  } catch (error) {
    return handleRouteError(error);
  }
}
