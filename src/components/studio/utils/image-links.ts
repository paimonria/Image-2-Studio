import type { ImageRecord } from "../../../lib/types";

type ImageLinkRecord = Pick<ImageRecord, "imageUrl">;

export function getImageRecordUrl(record: ImageLinkRecord, origin: string) {
  return new URL(record.imageUrl, origin).toString();
}

export function getImageRecordUrls(records: readonly ImageLinkRecord[], origin: string) {
  return records.map((record) => getImageRecordUrl(record, origin));
}

export function formatImageRecordLinks(records: readonly ImageLinkRecord[], origin: string) {
  return getImageRecordUrls(records, origin).join("\n");
}
