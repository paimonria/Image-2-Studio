import type { ImageRecord } from "./types";

export function mergeHistoryRecords(current: ImageRecord[], incoming: ImageRecord[]) {
  const seen = new Set<string>();
  const merged: ImageRecord[] = [];

  for (const record of [...current, ...incoming]) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    merged.push(record);
  }

  return merged;
}
