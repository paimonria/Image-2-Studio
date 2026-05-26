import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImageRecord, PromptTemplateResponse } from "../src/lib/types";
import {
  getAllHistoryTags,
  getVisiblePromptTemplates
} from "../src/components/studio/utils/gallery-derived-lists";

function createRecord(id: string, tags: string[]): ImageRecord {
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
    tags
  };
}

function createTemplate(id: string, mode: PromptTemplateResponse["mode"]): PromptTemplateResponse {
  return {
    id,
    title: id,
    category: "General",
    mode,
    content: `Template ${id}`,
    createdAt: "2026-05-26T08:00:00.000Z",
    updatedAt: "2026-05-26T08:00:00.000Z"
  };
}

describe("gallery derived lists", () => {
  it("returns sorted unique history tags", () => {
    const tags = getAllHistoryTags([
      createRecord("one", ["product", "hero"]),
      createRecord("two", ["hero", "campaign"]),
      createRecord("three", [])
    ]);

    assert.deepEqual(tags, ["campaign", "hero", "product"]);
  });

  it("shows universal templates and templates matching the active mode", () => {
    const templates = [
      createTemplate("text", "text-to-image"),
      createTemplate("image", "image-to-image"),
      createTemplate("universal", "universal")
    ];

    assert.deepEqual(
      getVisiblePromptTemplates(templates, "text-to-image").map((template) => template.id),
      ["text", "universal"]
    );
    assert.deepEqual(
      getVisiblePromptTemplates(templates, "image-to-image").map((template) => template.id),
      ["image", "universal"]
    );
  });
});
