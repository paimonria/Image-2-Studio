import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { savePlatformProviderConfig } from "@/lib/server/provider-config";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      keys?: Partial<Record<string, string>>;
      baseUrls?: Partial<Record<string, string>>;
      models?: Partial<Record<string, string>>;
    };

    await savePlatformProviderConfig({
      keys: {
        openai: typeof body.keys?.openai === "string" ? body.keys.openai : undefined
      },
      baseUrls: {
        openai: typeof body.baseUrls?.openai === "string" ? body.baseUrls.openai : undefined
      },
      models: {
        openai: typeof body.models?.openai === "string" ? body.models.openai : undefined
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
