import type {
  CatalogResponse,
  ImageBatchResponse,
  ImageProjectResponse,
  ImageRecord
} from "../../../lib/types";
import { getModelLabel, getProviderLabel } from "./format";

export type HistoryFilterValue = {
  provider: "all" | string;
  model: "all" | string;
};

export type HistoryFilterState = {
  favoriteOnly: boolean;
  favoriteRecordIds: readonly string[];
  historyFilter: HistoryFilterValue;
  historyBatchFilter: string;
  historyProjectFilter: string;
  historyTagFilter: string;
  historySearch: string;
};

export type HistoryRecordFilterInput = HistoryFilterState & {
  records: readonly ImageRecord[];
  catalog: CatalogResponse | null;
  batches: readonly Pick<ImageBatchResponse, "id" | "name">[];
  projects: readonly Pick<ImageProjectResponse, "id" | "name">[];
};

export function filterHistoryRecords(input: HistoryRecordFilterInput): ImageRecord[] {
  const query = input.historySearch.trim().toLowerCase();
  const expectedTag = input.historyTagFilter.trim().toLowerCase();
  const favorites = new Set(input.favoriteRecordIds);

  return input.records.filter((record) => {
    if (input.favoriteOnly && !favorites.has(record.id)) return false;
    if (input.historyFilter.provider !== "all" && record.provider !== input.historyFilter.provider) return false;
    if (input.historyFilter.model !== "all" && record.model !== input.historyFilter.model) return false;
    if (input.historyBatchFilter !== "all" && record.batchId !== input.historyBatchFilter) return false;
    if (input.historyProjectFilter !== "all" && record.projectId !== input.historyProjectFilter) return false;
    if (expectedTag && !record.tags.some((tag) => tag.toLowerCase().includes(expectedTag))) return false;
    if (!query) return true;

    return getHistoryRecordSearchText(record, input).includes(query);
  });
}

export function areHistoryFiltersActive(input: Omit<HistoryFilterState, "favoriteRecordIds">) {
  return Boolean(
    input.favoriteOnly
    || input.historySearch.trim()
    || input.historyFilter.provider !== "all"
    || input.historyFilter.model !== "all"
    || input.historyBatchFilter !== "all"
    || input.historyProjectFilter !== "all"
    || input.historyTagFilter.trim()
  );
}

function getHistoryRecordSearchText(record: ImageRecord, input: HistoryRecordFilterInput) {
  return [
    record.prompt,
    record.model,
    record.provider,
    record.size,
    record.aspectRatio,
    record.quality,
    record.tags.join(" "),
    input.projects.find((project) => project.id === record.projectId)?.name,
    input.batches.find((batch) => batch.id === record.batchId)?.name,
    getProviderLabel(input.catalog, record.provider),
    getModelLabel(input.catalog, record.provider, record.model)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
