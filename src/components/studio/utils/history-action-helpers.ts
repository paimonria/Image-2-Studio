import type { Locale } from "./copy";

const HISTORY_IMAGE_DOWNLOAD_DELAY_MS = 120;

export function getUniqueHistoryIds(ids: readonly string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function mergeHistoryIds(currentIds: readonly string[], nextIds: readonly string[]) {
  return getUniqueHistoryIds([...currentIds, ...nextIds]);
}

export function removeHistoryIds(currentIds: readonly string[], idsToRemove: readonly string[]) {
  const removedIds = new Set(idsToRemove);
  return currentIds.filter((id) => !removedIds.has(id));
}

export function getDeletedHistoryIds(deletedIds: unknown, fallbackIds: readonly string[]) {
  return Array.isArray(deletedIds)
    ? deletedIds.filter((id): id is string => typeof id === "string")
    : [...fallbackIds];
}

export function getDeleteHistoryImagesConfirmMessage(count: number, locale: Locale) {
  if (count === 1) {
    return locale === "zh" ? "删除这张图片？此操作不可撤销。" : "Delete this image? This cannot be undone.";
  }

  return locale === "zh"
    ? `删除选中的 ${count} 张图片？此操作不可撤销。`
    : `Delete ${count} selected images? This cannot be undone.`;
}

export function getHistoryImagesDeleteFailedMessage(locale: Locale) {
  return locale === "zh" ? "图片删除失败。" : "Images could not be deleted.";
}

export function getCreateProjectFailedMessage(locale: Locale) {
  return locale === "zh" ? "项目创建失败。" : "Project could not be created.";
}

export function getAssignImagesFailedMessage(locale: Locale) {
  return locale === "zh" ? "图片整理失败。" : "Images could not be organized.";
}

export function getExportImagesFailedMessage(locale: Locale) {
  return locale === "zh" ? "导出失败。" : "Export failed.";
}

export function parseAssignTags(value: string) {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getHistoryImageDownloadFileName(recordId: string) {
  return `image-2-${recordId}.png`;
}

export function getHistoryImageDownloadDelay(index: number) {
  return index * HISTORY_IMAGE_DOWNLOAD_DELAY_MS;
}

export function getExportZipFileName(now = Date.now()) {
  return `image-2-export-${now}.zip`;
}
