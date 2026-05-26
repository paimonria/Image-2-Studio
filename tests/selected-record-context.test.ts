import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogResponse, ImageRecord } from "../src/lib/types";
import {
  canContinueImageRecord,
  getSelectedRecordContext
} from "../src/components/studio/utils/selected-record-context";

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
      capabilities: ["text-to-image", "image-to-image", "continue-edit"]
    },
    {
      provider: "openai",
      modelId: "basic-model",
      label: "Basic model",
      description: "",
      capabilities: ["text-to-image"]
    }
  ]
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
    sourceImageIds: [],
    uploadUrls: [],
    tags: [],
    ...overrides
  };
}

describe("selected record context", () => {
  it("resolves the selected record, model, and ordered source records", () => {
    const records = [
      createRecord("selected"),
      createRecord("source-a"),
      createRecord("source-b")
    ];

    const context = getSelectedRecordContext({
      records,
      selectedRecordId: "selected",
      catalog,
      sourceImageIds: ["source-b", "missing", "source-a"]
    });

    assert.equal(context.selectedRecord?.id, "selected");
    assert.equal(context.selectedRecordModel?.modelId, "gpt-image-2");
    assert.equal(context.selectedRecordCanContinue, true);
    assert.deepEqual(context.activeSourceRecords.map((record) => record.id), ["source-b", "source-a"]);
  });

  it("requires provider configuration and model capability before continuing", () => {
    assert.equal(canContinueImageRecord(createRecord("standalone"), catalog), true);

    const unsupported = getSelectedRecordContext({
      records: [
        createRecord("selected", {
          model: "basic-model"
        })
      ],
      selectedRecordId: "selected",
      catalog,
      sourceImageIds: []
    });

    assert.equal(unsupported.selectedRecordCanContinue, false);
    assert.equal(canContinueImageRecord(createRecord("unsupported", { model: "basic-model" }), catalog), false);

    const unconfigured = getSelectedRecordContext({
      records: [createRecord("selected")],
      selectedRecordId: "selected",
      catalog: {
        ...catalog,
        providers: catalog.providers.map((provider) => ({
          ...provider,
          configured: false
        }))
      },
      sourceImageIds: []
    });

    assert.equal(unconfigured.selectedRecordCanContinue, false);
    assert.equal(canContinueImageRecord(createRecord("unconfigured"), {
      ...catalog,
      providers: catalog.providers.map((provider) => ({
        ...provider,
        configured: false
      }))
    }), false);
  });

  it("returns an empty context when the selected id is missing", () => {
    const context = getSelectedRecordContext({
      records: [createRecord("available")],
      selectedRecordId: "missing",
      catalog,
      sourceImageIds: []
    });

    assert.equal(context.selectedRecord, undefined);
    assert.equal(context.selectedRecordModel, undefined);
    assert.equal(context.selectedRecordCanContinue, false);
    assert.deepEqual(context.activeSourceRecords, []);
  });
});
