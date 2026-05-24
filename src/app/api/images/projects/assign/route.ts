import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { assignImagesToProject } from "@/lib/server/projects";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      recordIds?: unknown;
      projectId?: unknown;
      tags?: unknown;
    };
    const result = await assignImagesToProject(user.id, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
