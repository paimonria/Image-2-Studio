import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageRecord } from "../src/lib/types";
import { getHistorySelectionContext } from "../src/components/studio/utils/history-selection-context";

function createRecord(id: string): ImageRecord {
  return {
    id,
    createdAt: "2026-05-26T08:00:00.000Z",
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    prompt: `Prompt ${id}`,
    imageUrl: `/api/images/file/${id}`,
    imagePath: `storage/${id}.png`,
    sourceImageIds: [],
    uploadUrls: [],
    tags: []
  };
}

describe("history selection context", () => {
  it("builds stable id sets for gallery membership checks", () => {
    const context = getHistorySelectionContext({
      records: [],
      filteredRecords: [],
      favoriteRecordIds: ["favorite-a", "favorite-b", "favorite-a"],
      selectedHistoryIds: ["selected-a", "selected-b", "selected-a"],
      deletingHistoryIds: ["deleting-a", "deleting-a"]
    });

    assert.deepEqual([...context.favoriteRecordIdSet], ["favorite-a", "favorite-b"]);
    assert.deepEqual([...context.selectedHistoryIdSet], ["selected-a", "selected-b"]);
    assert.deepEqual([...context.deletingHistoryIdSet], ["deleting-a"]);
  });

  it("keeps selected history records in visible gallery order", () => {
    const one = createRecord("one");
    const two = createRecord("two");
    const three = createRecord("three");

    const context = getHistorySelectionContext({
      records: [three, two, one],
      filteredRecords: [one, two],
      favoriteRecordIds: [],
      selectedHistoryIds: ["two", "missing", "one"],
      deletingHistoryIds: []
    });

    assert.deepEqual(context.selectedHistoryRecords.map((record) => record.id), ["one", "two"]);
    assert.deepEqual(context.filteredRecordIds, ["one", "two"]);
    assert.deepEqual(context.allRecordIds, ["three", "two", "one"]);
  });

  it("returns empty derived collections when no records are visible", () => {
    const context = getHistorySelectionContext({
      records: [],
      filteredRecords: [],
      favoriteRecordIds: [],
      selectedHistoryIds: [],
      deletingHistoryIds: []
    });

    assert.deepEqual([...context.favoriteRecordIdSet], []);
    assert.deepEqual([...context.selectedHistoryIdSet], []);
    assert.deepEqual([...context.deletingHistoryIdSet], []);
    assert.deepEqual(context.selectedHistoryRecords, []);
    assert.deepEqual(context.filteredRecordIds, []);
    assert.deepEqual(context.allRecordIds, []);
  });
});
