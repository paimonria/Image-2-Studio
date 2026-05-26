import type { ImageRecord, PromptTemplateResponse } from "../../../lib/types";

export function getAllHistoryTags(records: readonly ImageRecord[]) {
  return Array.from(new Set(records.flatMap((record) => record.tags)))
    .sort((left, right) => left.localeCompare(right));
}

export function getVisiblePromptTemplates(
  templates: readonly PromptTemplateResponse[],
  mode: PromptTemplateResponse["mode"]
) {
  return templates.filter((template) => template.mode === "universal" || template.mode === mode);
}
