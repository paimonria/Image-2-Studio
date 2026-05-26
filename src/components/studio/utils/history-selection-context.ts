import type { ImageRecord } from "../../../lib/types";

type HistorySelectionContextInput = {
  records: readonly ImageRecord[];
  filteredRecords: readonly ImageRecord[];
  favoriteRecordIds: readonly string[];
  selectedHistoryIds: readonly string[];
  deletingHistoryIds: readonly string[];
};

export type HistorySelectionContext = {
  favoriteRecordIdSet: Set<string>;
  selectedHistoryIdSet: Set<string>;
  deletingHistoryIdSet: Set<string>;
  selectedHistoryRecords: ImageRecord[];
  filteredRecordIds: string[];
  allRecordIds: string[];
};

export function getHistorySelectionContext(input: HistorySelectionContextInput): HistorySelectionContext {
  const selectedHistoryIdSet = new Set(input.selectedHistoryIds);

  return {
    favoriteRecordIdSet: new Set(input.favoriteRecordIds),
    selectedHistoryIdSet,
    deletingHistoryIdSet: new Set(input.deletingHistoryIds),
    selectedHistoryRecords: input.filteredRecords.filter((record) => selectedHistoryIdSet.has(record.id)),
    filteredRecordIds: input.filteredRecords.map((record) => record.id),
    allRecordIds: input.records.map((record) => record.id)
  };
}
