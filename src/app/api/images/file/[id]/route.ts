import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { readStoredImageMetaForUser } from "@/lib/server/files";
import { handleRouteError } from "@/lib/server/responses";

export const runtime = "nodejs";

async function getImageFileResponseContext(context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const image = await readStoredImageMetaForUser(user.id, id);
  const fileStats = await stat(image.filePath);
  const headers = {
    "content-type": image.mimeType,
    "content-length": String(fileStats.size),
    "cache-control": "private, max-age=86400, immutable",
    "last-modified": fileStats.mtime.toUTCString()
  };

  return { image, headers };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { image, headers } = await getImageFileResponseContext(context);
    const stream = Readable.toWeb(createReadStream(image.filePath));

    return new NextResponse(stream as BodyInit, { headers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function HEAD(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { headers } = await getImageFileResponseContext(context);
    return new NextResponse(null, { headers });
  } catch (error) {
    return handleRouteError(error);
  }
}
