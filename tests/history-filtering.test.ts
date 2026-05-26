import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogResponse, ImageRecord } from "../src/lib/types";
import {
  areHistoryFiltersActive,
  filterHistoryRecords,
  type HistoryFilterState
} from "../src/components/studio/utils/history-filtering";

const catalog: CatalogResponse = {
  providers: [
    {
      provider: "openai",
      label: "OpenAI",
      configured: true
    }
  ],
  models: [
    {
      provider: "openai",
      modelId: "gpt-image-2",
      label: "GPT Image 2",
      description: "",
      capabilities: []
    },
    {
      provider: "openai",
      modelId: "custom-style",
      label: "Custom Style",
      description: "",
      capabilities: []
    }
  ]
};

const baseState: HistoryFilterState = {
  favoriteOnly: false,
  favoriteRecordIds: [],
  historyFilter: {
    provider: "all",
    model: "all"
  },
  historyBatchFilter: "all",
  historyProjectFilter: "all",
  historyTagFilter: "",
  historySearch: ""
};

const baseActiveState = {
  favoriteOnly: false,
  historyFilter: {
    provider: "all",
    model: "all"
  },
  historyBatchFilter: "all",
  historyProjectFilter: "all",
  historyTagFilter: "",
  historySearch: ""
};

function createRecord(id: string, overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id,
    createdAt: "2026-05-26T08:00:00.000Z",
    provider: "openai",
    model: "gpt-image-2",
    mode: "text-to-image",
    prompt: `Prompt ${id}`,
    imageUrl: `/api/images/file/${id}`,
    imagePath: `storage/${id}.png`,
    size: "1024x1024",
    aspectRatio: "1:1",
    quality: "medium",
    sourceImageIds: [],
    uploadUrls: [],
    tags: [],
    ...overrides
  };
}

function filterRecords(overrides: Partial<HistoryFilterState> = {}) {
  return filterHistoryRecords({
    ...baseState,
    ...overrides,
    records: [
      createRecord("one", {
        prompt: "A clean product shot",
        tags: ["Product", "Hero"],
        projectId: "project-a",
        batchId: "batch-a"
      }),
      createRecord("two", {
        prompt: "An editorial poster",
        model: "custom-style",
        tags: ["Poster"],
        projectId: "project-b",
        batchId: "batch-b"
      }),
      createRecord("three", {
        prompt: "A quiet dashboard mockup",
        tags: ["UI"]
      })
    ],
    catalog,
    batches: [
      {
        id: "batch-a",
        name: "Launch batch"
      },
      {
        id: "batch-b",
        name: "Poster batch"
      }
    ],
    projects: [
      {
        id: "project-a",
        name: "Commerce refresh"
      },
      {
        id: "project-b",
        name: "Campaign kit"
      }
    ]
  }).map((record) => record.id);
}

describe("history record filtering", () => {
  it("keeps records in their original order when no filters are active", () => {
    assert.deepEqual(filterRecords(), ["one", "two", "three"]);
  });

  it("filters by favorite, provider, model, batch, project, and tag", () => {
    assert.deepEqual(filterRecords({
      favoriteOnly: true,
      favoriteRecordIds: ["two"]
    }), ["two"]);

    assert.deepEqual(filterRecords({
      historyFilter: {
        provider: "openai",
        model: "custom-style"
      }
    }), ["two"]);

    assert.deepEqual(filterRecords({
      historyBatchFilter: "batch-a"
    }), ["one"]);

    assert.deepEqual(filterRecords({
      historyProjectFilter: "project-b"
    }), ["two"]);

    assert.deepEqual(filterRecords({
      historyTagFilter: "hero"
    }), ["one"]);
  });

  it("searches record metadata, project names, batch names, and catalog labels", () => {
    assert.deepEqual(filterRecords({ historySearch: "dashboard" }), ["three"]);
    assert.deepEqual(filterRecords({ historySearch: "commerce refresh" }), ["one"]);
    assert.deepEqual(filterRecords({ historySearch: "poster batch" }), ["two"]);
    assert.deepEqual(filterRecords({ historySearch: "GPT Image 2" }), ["one", "three"]);
  });

  it("detects active history filters without depending on record data", () => {
    assert.equal(areHistoryFiltersActive(baseActiveState), false);

    assert.equal(areHistoryFiltersActive({
      ...baseActiveState,
      historySearch: " poster "
    }), true);

    assert.equal(areHistoryFiltersActive({
      ...baseActiveState,
      historyProjectFilter: "project-a"
    }), true);
  });
});
